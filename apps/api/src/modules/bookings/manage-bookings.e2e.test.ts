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
interface BookingBody {
  id: string;
  status: string;
  party: string;
  allowedActions: string[];
  statusReason: string | null;
  cancelledBy: string | null;
  cancelDeadlineAt: string;
  client: { name: string };
  specialist: { displayName: string };
}
type Client = ReturnType<typeof httpClient>;

async function specialist(settings: Record<string, unknown> = {}) {
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

async function client() {
  const user = await signedInUser(server, testApp.database.db);
  return { ...user, c: httpClient(server, user.session) };
}

/** Free slots over a week starting `daysAhead` days from now. */
async function freeSlots(owner: Specialist, daysAhead = 3): Promise<Slot[]> {
  const from = new Date(Date.now() + daysAhead * DAY);
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

/** A client books the n-th free slot of the specialist. */
async function booked(owner: Specialist, who: { c: Client }, n = 0): Promise<BookingBody> {
  const slot = (await freeSlots(owner))[n];
  if (!slot) throw new Error('expected a free slot');
  const response = await who.c
    .post('/bookings', { serviceId: owner.serviceId, startAt: slot.start })
    .expect(201);
  return response.body as BookingBody;
}

const body = (response: { body: unknown }) => response.body as BookingBody;

const statusEmails = (email: string) =>
  testApp.database.db
    .select()
    .from(outboxMessages)
    .where(
      sql`${outboxMessages.payload}->>'to' = ${email} and ${outboxMessages.type} in ('booking.confirmed', 'booking.rejected', 'booking.cancelled')`,
    );

beforeAll(async () => {
  testApp = await startTestApp();
  server = testApp.app.getHttpServer();
});

afterAll(async () => {
  await testApp?.close();
});

describe('answering a request (FR-52)', () => {
  it('lets the specialist confirm; each side then sees its own actions', async () => {
    const owner = await specialist();
    const anna = await client();
    const request = await booked(owner, anna);
    expect(request).toMatchObject({
      status: 'pending',
      party: 'client',
      allowedActions: ['cancel'],
    });

    const asSpecialist = await owner.c.get(`/bookings/${request.id}`).expect(200);
    expect(body(asSpecialist)).toMatchObject({
      party: 'specialist',
      client: { name: 'Анна' },
      allowedActions: ['confirm', 'reject', 'cancel'],
    });

    const confirmed = await owner.c.post(`/bookings/${request.id}/confirm`).expect(200);
    expect(body(confirmed)).toMatchObject({
      status: 'confirmed',
      expiresAt: null,
      allowedActions: ['cancel'],
    });
    const seenByClient = await anna.c.get(`/bookings/${request.id}`).expect(200);
    expect(body(seenByClient)).toMatchObject({ status: 'confirmed', allowedActions: ['cancel'] });

    const [email] = await statusEmails(anna.email);
    expect(email).toMatchObject({
      type: 'booking.confirmed',
      payload: { specialistName: 'Ирина', timeZone: 'Europe/Moscow' },
    });
  });

  it('rejects with a reason, frees the time and tells the client', async () => {
    const owner = await specialist();
    const anna = await client();
    const request = await booked(owner, anna);

    const rejected = await owner.c
      .post(`/bookings/${request.id}/reject`, { reason: '  Заболела  ' })
      .expect(200);
    expect(body(rejected)).toMatchObject({ status: 'rejected', statusReason: 'Заболела' });
    const [email] = await statusEmails(anna.email);
    expect(email).toMatchObject({ type: 'booking.rejected', payload: { reason: 'Заболела' } });

    // The time is offered again: a second request for it succeeds
    const boris = await client();
    await booked(owner, boris);
  });

  it('refuses what the party may not do, and stale actions', async () => {
    const owner = await specialist();
    const anna = await client();
    const request = await booked(owner, anna);

    const byClient = await anna.c.post(`/bookings/${request.id}/confirm`).expect(403);
    expect(byClient.body).toMatchObject({ code: 'BOOKING_ACTION_FORBIDDEN' });

    await owner.c.post(`/bookings/${request.id}/confirm`).expect(200);
    // A second tab still showing "pending"
    const again = await owner.c.post(`/bookings/${request.id}/confirm`).expect(409);
    expect(again.body).toMatchObject({ code: 'BOOKING_STATUS_CHANGED' });
  });

  it('cannot confirm a request that has expired, even before the expiry job ran', async () => {
    const owner = await specialist();
    const anna = await client();
    const request = await booked(owner, anna);
    await testApp.database.db
      .update(bookings)
      .set({ expiresAt: new Date(Date.now() - HOUR) })
      .where(eq(bookings.id, request.id));

    const seen = await owner.c.get(`/bookings/${request.id}`).expect(200);
    expect(body(seen)).toMatchObject({ status: 'expired', allowedActions: [] });
    await owner.c.post(`/bookings/${request.id}/confirm`).expect(409);
  });

  it('applies exactly one of a confirmation and a cancellation sent at once', async () => {
    for (let round = 0; round < 5; round++) {
      const owner = await specialist();
      const anna = await client();
      const request = await booked(owner, anna);

      const [confirm, cancel] = await Promise.all([
        owner.c.post(`/bookings/${request.id}/confirm`),
        anna.c.post(`/bookings/${request.id}/cancel`, {}),
      ]);
      expect([confirm.status, cancel.status].sort()).toEqual([200, 409]);
      const winner = confirm.status === 200 ? 'confirmed' : 'cancelled';
      const [row] = await testApp.database.db
        .select()
        .from(bookings)
        .where(eq(bookings.id, request.id));
      expect(row?.status).toBe(winner);
      // Only the winner's email: no contradicting "confirmed" and "cancelled"
      const emails = [...(await statusEmails(anna.email)), ...(await statusEmails(owner.email))];
      expect(emails).toHaveLength(1);
    }
  });
});

describe('cancelling (FR-53)', () => {
  // A confirmed booking has no expiry: only the status condition of the compare-and-set
  // stops the second cancellation (for pending, `expires_at > now` would hide its absence)
  it('applies exactly one of two cancellations of a confirmed booking sent at once', async () => {
    for (let round = 0; round < 5; round++) {
      const owner = await specialist({ confirmationMode: 'auto' });
      const anna = await client();
      const booking = await booked(owner, anna);

      const [bySpecialist, byClient] = await Promise.all([
        owner.c.post(`/bookings/${booking.id}/cancel`, { reason: 'Заболела' }),
        anna.c.post(`/bookings/${booking.id}/cancel`, {}),
      ]);
      expect([bySpecialist.status, byClient.status].sort()).toEqual([200, 409]);
      const emails = [...(await statusEmails(anna.email)), ...(await statusEmails(owner.email))];
      expect(emails).toHaveLength(1);
    }
  });

  it('tells the specialist when the client withdraws a request', async () => {
    const owner = await specialist();
    const anna = await client();
    const request = await booked(owner, anna);

    const cancelled = await anna.c.post(`/bookings/${request.id}/cancel`, {}).expect(200);
    expect(body(cancelled)).toMatchObject({
      status: 'cancelled',
      cancelledBy: 'client',
      statusReason: null,
    });
    const [email] = await statusEmails(owner.email);
    expect(email).toMatchObject({
      type: 'booking.cancelled',
      payload: { cancelledBy: 'client', byName: 'Анна', timeZone: 'Europe/Berlin' },
    });
  });

  it('keeps the cancellation deadline of booking time when the setting changes', async () => {
    const owner = await specialist({ confirmationMode: 'auto', clientCancelDeadlineHours: 24 });
    const anna = await client();
    const booking = await booked(owner, anna); // three days ahead

    // The specialist now demands 5 days' notice; Anna booked under "24 hours"
    await owner.c.patch('/me/specialist-profile', { clientCancelDeadlineHours: 120 }).expect(200);
    const seen = await anna.c.get(`/bookings/${booking.id}`).expect(200);
    expect(body(seen).cancelDeadlineAt).toBe(booking.cancelDeadlineAt);
    expect(body(seen).allowedActions).toEqual(['cancel']);
    await anna.c.post(`/bookings/${booking.id}/cancel`, {}).expect(200);
  });

  it('leaves cancellation to the specialist once the deadline has passed', async () => {
    const owner = await specialist({ confirmationMode: 'auto' });
    const anna = await client();
    const booking = await booked(owner, anna);
    await testApp.database.db
      .update(bookings)
      .set({ cancelDeadlineAt: new Date(Date.now() - HOUR) })
      .where(eq(bookings.id, booking.id));

    const late = await anna.c.post(`/bookings/${booking.id}/cancel`, {}).expect(422);
    expect(late.body).toMatchObject({ code: 'CANCEL_DEADLINE_PASSED' });
    const bySpecialist = await owner.c
      .post(`/bookings/${booking.id}/cancel`, { reason: 'Перенос' })
      .expect(200);
    expect(body(bySpecialist)).toMatchObject({
      cancelledBy: 'specialist',
      statusReason: 'Перенос',
    });
  });

  it("treats someone else's booking as missing", async () => {
    const owner = await specialist();
    const anna = await client();
    const stranger = await client();
    const request = await booked(owner, anna);

    await stranger.c.get(`/bookings/${request.id}`).expect(404);
    await stranger.c.post(`/bookings/${request.id}/cancel`, {}).expect(404);
    await anna.c.get(`/bookings/${randomUUID()}`).expect(404);
    await anna.c.post(`/bookings/${request.id}/cancel`, { reason: 'x'.repeat(501) }).expect(400);
  });
});

describe('GET /me/bookings (FR-55)', () => {
  it('lists by side, scope and effective status, with paging', async () => {
    const owner = await specialist();
    const anna = await client();
    const first = await booked(owner, anna, 0);
    const second = await booked(owner, anna, 2);

    // An overdue request and a past booking, written directly
    const [overdue] = await testApp.database.db
      .update(bookings)
      .set({ expiresAt: new Date(Date.now() - HOUR) })
      .where(eq(bookings.id, second.id))
      .returning();
    const pastStart = new Date(Date.now() - 2 * DAY);
    await testApp.database.db.insert(bookings).values({
      specialistId: owner.userId,
      clientId: anna.userId,
      serviceId: owner.serviceId,
      serviceName: 'Консультация',
      startAt: pastStart,
      endAt: new Date(pastStart.getTime() + HOUR),
      status: 'confirmed',
      cancelDeadlineAt: pastStart,
    });

    const list = async (c: Client, query: string) =>
      (await c.get(`/me/bookings?${query}`).expect(200)).body as {
        items: BookingBody[];
        total: number;
      };

    const mine = await list(anna.c, 'as=client');
    expect(mine.total).toBe(2);
    expect(mine.items.map((b) => b.id)).toEqual([first.id, overdue!.id]); // soonest first
    expect(mine.items.every((b) => b.party === 'client')).toBe(true);

    const toMe = await list(owner.c, 'as=specialist&status=pending');
    expect(toMe.items.map((b) => b.id)).toEqual([first.id]);
    expect(toMe.items[0]).toMatchObject({ client: { name: 'Анна' } });
    const expired = await list(owner.c, 'as=specialist&status=expired');
    expect(expired.items.map((b) => b.id)).toEqual([overdue!.id]);

    const past = await list(anna.c, 'as=client&scope=past');
    expect(past).toMatchObject({ total: 1, items: [{ status: 'confirmed', allowedActions: [] }] });

    const page = await list(anna.c, 'as=client&limit=1&offset=1');
    expect(page).toMatchObject({ total: 2, items: [{ id: overdue!.id }] });

    // Not a specialist: nothing made to them
    expect(await list(anna.c, 'as=specialist')).toMatchObject({ total: 0, items: [] });
    await anna.c.get('/me/bookings?limit=1000').expect(400);
  });
});
