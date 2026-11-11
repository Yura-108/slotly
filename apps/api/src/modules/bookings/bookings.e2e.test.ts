import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import type { App } from 'supertest/types';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bookings, outboxMessages } from '../../infrastructure/database/schema';
import { startTestApp, type TestApp } from '../../test-utils/app';
import { httpClient, signedInUser } from '../../test-utils/http';

let testApp: TestApp;
let server: App;

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

interface Slot {
  start: string;
  end: string;
}

/** A Berlin specialist working 09:00–17:00 every day, with a 60-minute service. */
async function specialist(settings: { confirmationMode?: 'auto' | 'manual' } = {}) {
  const user = await signedInUser(server, testApp.database.db);
  const c = httpClient(server, user.session);
  const slug = `spec-${randomUUID().slice(0, 8)}`;
  await c
    .post('/me/specialist-profile', {
      slug,
      displayName: 'Ирина',
      timezone: 'Europe/Berlin',
      ...settings,
    })
    .expect(201);
  await c
    .put('/me/availability', {
      intervals: [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({
        weekday,
        start: '09:00',
        end: '17:00',
      })),
    })
    .expect(200);
  const service = await c.post('/me/services', { name: 'Консультация', durationMinutes: 60 });
  return { ...user, c, slug, serviceId: (service.body as { id: string }).id };
}

type Specialist = Awaited<ReturnType<typeof specialist>>;

/** Free slots over a week starting two days ahead (clear of the 2-hour minimum notice). */
async function freeSlots(owner: Specialist): Promise<Slot[]> {
  const from = new Date(Date.now() + 2 * DAY);
  const query = new URLSearchParams({
    serviceId: owner.serviceId,
    from: from.toISOString(),
    to: new Date(from.getTime() + 7 * DAY).toISOString(),
  });
  const response = await httpClient(server)
    .get(`/specialists/${owner.slug}/slots?${query.toString()}`)
    .expect(200);
  return (response.body as { items: Slot[] }).items;
}

async function client() {
  const user = await signedInUser(server, testApp.database.db);
  return { ...user, c: httpClient(server, user.session) };
}

const book = (c: ReturnType<typeof httpClient>, serviceId: string, startAt: string) =>
  c.post('/bookings', { serviceId, startAt });

const outboxFor = (email: string) =>
  testApp.database.db
    .select()
    .from(outboxMessages)
    // Registration has queued a confirmation email to the same address: only booking emails
    .where(
      sql`${outboxMessages.payload}->>'to' = ${email} and ${outboxMessages.type} like 'booking.%'`,
    );

beforeAll(async () => {
  testApp = await startTestApp();
  server = testApp.app.getHttpServer();
});

afterAll(async () => {
  await testApp?.close();
});

describe('POST /bookings', () => {
  it('creates a request in manual mode, takes the slot and records both emails', async () => {
    const owner = await specialist();
    const anna = await client();
    const [slot] = await freeSlots(owner);
    if (!slot) throw new Error('expected slots');

    const before = Date.now();
    const response = await book(anna.c, owner.serviceId, slot.start).expect(201);
    const booking = response.body as { status: string; expiresAt: string; startAt: string };
    expect(response.body).toMatchObject({
      status: 'pending',
      serviceName: 'Консультация',
      startAt: slot.start,
      endAt: slot.end,
      specialist: { slug: owner.slug, displayName: 'Ирина' },
    });
    // The slot is two days ahead: the specialist has 24 hours to answer
    const expiresIn = Date.parse(booking.expiresAt) - before;
    expect(expiresIn).toBeGreaterThanOrEqual(DAY - 5_000);
    expect(expiresIn).toBeLessThanOrEqual(DAY + 5_000);

    expect((await freeSlots(owner)).map((s) => s.start)).not.toContain(slot.start);

    const [toSpecialist] = await outboxFor(owner.email);
    expect(toSpecialist).toMatchObject({
      type: 'booking.new_for_specialist',
      payload: {
        timeZone: 'Europe/Berlin',
        clientName: 'Анна',
        needsConfirmation: true,
        startAt: slot.start,
      },
    });
    const [toClient] = await outboxFor(anna.email);
    expect(toClient).toMatchObject({
      type: 'booking.created_for_client',
      // The client's own zone from the profile, not the specialist's
      payload: { timeZone: 'Europe/Moscow', specialistName: 'Ирина', status: 'pending' },
    });
  });

  it('confirms right away in automatic mode', async () => {
    const owner = await specialist({ confirmationMode: 'auto' });
    const anna = await client();
    const [slot] = await freeSlots(owner);
    if (!slot) throw new Error('expected slots');

    const response = await book(anna.c, owner.serviceId, slot.start).expect(201);
    expect(response.body).toMatchObject({ status: 'confirmed', expiresAt: null });
    const [toSpecialist] = await outboxFor(owner.email);
    expect(toSpecialist?.payload).toMatchObject({ needsConfirmation: false });
  });

  it('lets exactly one of many concurrent clients take a slot (FR-51)', async () => {
    const owner = await specialist({ confirmationMode: 'auto' });
    const [slot] = await freeSlots(owner);
    if (!slot) throw new Error('expected slots');
    const clients = await Promise.all(Array.from({ length: 8 }, () => client()));

    const responses = await Promise.all(
      clients.map(({ c }) => book(c, owner.serviceId, slot.start)),
    );
    expect(responses.map((r) => r.status).sort()).toEqual([201, ...Array<number>(7).fill(409)]);
    const conflict = responses.find((r) => r.status === 409);
    expect(conflict?.body).toMatchObject({ code: 'BOOKING_SLOT_TAKEN' });
    const stored = await testApp.database.db
      .select()
      .from(bookings)
      .where(eq(bookings.specialistId, owner.userId));
    expect(stored).toHaveLength(1);
  });

  it('accepts only slots the specialist offers', async () => {
    const owner = await specialist();
    const anna = await client();
    const [slot] = await freeSlots(owner);
    if (!slot) throw new Error('expected slots');
    const shifted = (minutes: number) =>
      new Date(Date.parse(slot.start) + minutes * 60_000).toISOString();

    for (const startAt of [
      shifted(30), // off the grid
      shifted(-7 * 24 * 60), // in the past
      shifted(400 * 24 * 60), // beyond the horizon
    ]) {
      const response = await book(anna.c, owner.serviceId, startAt).expect(422);
      expect(response.body).toMatchObject({ code: 'SLOT_NOT_AVAILABLE' });
    }
  });

  it('caps active requests of a client to one specialist, even when sent at once (FR-56)', async () => {
    const owner = await specialist();
    const anna = await client();
    const slots = await freeSlots(owner);

    await book(anna.c, owner.serviceId, slots[0]!.start).expect(201);
    await book(anna.c, owner.serviceId, slots[1]!.start).expect(201);
    // Two tabs at once with two requests left to the limit of 3: only one may pass
    const [a, b] = await Promise.all([
      book(anna.c, owner.serviceId, slots[2]!.start),
      book(anna.c, owner.serviceId, slots[3]!.start),
    ]);
    expect([a.status, b.status].sort()).toEqual([201, 422]);
    expect([a, b].find((r) => r.status === 422)?.body).toMatchObject({
      code: 'PENDING_LIMIT_REACHED',
    });

    // Another client is not affected
    const boris = await client();
    await book(boris.c, owner.serviceId, slots[4]!.start).expect(201);
  });

  it('gives the time of an overdue request to a new booking', async () => {
    const owner = await specialist();
    const [slot] = await freeSlots(owner);
    if (!slot) throw new Error('expected slots');
    const old = await client();
    const [overdue] = await testApp.database.db
      .insert(bookings)
      .values({
        specialistId: owner.userId,
        clientId: old.userId,
        serviceId: owner.serviceId,
        serviceName: 'Консультация',
        startAt: new Date(slot.start),
        endAt: new Date(slot.end),
        status: 'pending',
        expiresAt: new Date(Date.now() - HOUR),
      })
      .returning();

    const anna = await client();
    await book(anna.c, owner.serviceId, slot.start).expect(201);
    const [after] = await testApp.database.db
      .select()
      .from(bookings)
      .where(eq(bookings.id, overdue!.id));
    expect(after).toMatchObject({ status: 'expired', expiresAt: null });
  });

  it('refuses to book yourself, without a confirmed email, or without a session', async () => {
    const owner = await specialist();
    const [slot] = await freeSlots(owner);
    if (!slot) throw new Error('expected slots');

    const self = await book(owner.c, owner.serviceId, slot.start).expect(422);
    expect(self.body).toMatchObject({ code: 'CANNOT_BOOK_SELF' });

    const unverified = await signedInUser(server, testApp.database.db, { verified: false });
    const response = await book(
      httpClient(server, unverified.session),
      owner.serviceId,
      slot.start,
    ).expect(403);
    expect(response.body).toMatchObject({ code: 'EMAIL_NOT_VERIFIED' });

    await book(httpClient(server), owner.serviceId, slot.start).expect(401);
    expect(await outboxFor(owner.email)).toHaveLength(0);
  });

  it('treats archived and unknown services as missing; validates input', async () => {
    const owner = await specialist();
    const anna = await client();
    const [slot] = await freeSlots(owner);
    if (!slot) throw new Error('expected slots');

    await book(anna.c, randomUUID(), slot.start).expect(404);
    await owner.c.post(`/me/services/${owner.serviceId}/archive`).expect(204);
    await book(anna.c, owner.serviceId, slot.start).expect(404);

    await book(anna.c, owner.serviceId, 'tomorrow at ten').expect(400);
    await book(anna.c, 'not-a-uuid', slot.start).expect(400);
  });
});
