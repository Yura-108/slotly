import { randomUUID } from 'node:crypto';
import type { App } from 'supertest/types';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bookings } from '../../infrastructure/database/schema';
import { toLocalDateTime } from '../../shared/zoned-time';
import { startTestApp, type TestApp } from '../../test-utils/app';
import { httpClient, signedInUser } from '../../test-utils/http';

let testApp: TestApp;
let server: App;

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const ZONE = 'Europe/Berlin';

interface Slot {
  start: string;
  end: string;
}

/** A Berlin specialist working 09:00–17:00 every day, with a 60-minute service. */
async function specialist() {
  const user = await signedInUser(server, testApp.database.db);
  const c = httpClient(server, user.session);
  const slug = `spec-${randomUUID().slice(0, 8)}`;
  await c
    .post('/me/specialist-profile', { slug, displayName: 'Ирина', timezone: ZONE })
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

/** A week starting two days ahead: clear of the default 2-hour minimum notice. */
const week = () => {
  const from = new Date(Date.now() + 2 * DAY);
  return { from: from.toISOString(), to: new Date(from.getTime() + 7 * DAY).toISOString() };
};

async function getSlots(slug: string, query: Record<string, string>, expected = 200) {
  const params = new URLSearchParams(query).toString();
  return httpClient(server).get(`/specialists/${slug}/slots?${params}`).expect(expected);
}

const items = (response: { body: unknown }) => (response.body as { items: Slot[] }).items;

beforeAll(async () => {
  testApp = await startTestApp();
  server = testApp.app.getHttpServer();
});

afterAll(async () => {
  await testApp?.close();
});

describe('GET /specialists/:slug/slots', () => {
  it('is public and returns UTC slots on the grid of the working hours', async () => {
    const { slug, serviceId } = await specialist();
    const range = week();
    const response = await getSlots(slug, { serviceId, ...range });

    const slots = items(response);
    expect(response.body).toMatchObject({ total: slots.length });
    // 7 or 8 local dates are touched by 7×24 hours; at least 6 full days of 8 slots
    expect(slots.length).toBeGreaterThanOrEqual(6 * 8);
    for (const slot of slots) {
      expect(slot.start).toMatch(/Z$/);
      expect(Date.parse(slot.end) - Date.parse(slot.start)).toBe(HOUR);
      expect(slot.start >= range.from && slot.start < range.to).toBe(true);
      const local = toLocalDateTime(new Date(slot.start), ZONE);
      expect(local.minute % 60).toBe(0);
      expect(local.minute).toBeGreaterThanOrEqual(9 * 60);
      expect(local.minute).toBeLessThan(17 * 60);
    }
  });

  it('excludes active bookings by effective status, but not expired pending ones', async () => {
    const owner = await specialist();
    const client = await signedInUser(server, testApp.database.db);
    const range = week();
    const before = items(await getSlots(owner.slug, { serviceId: owner.serviceId, ...range }));
    const [confirmed, expired, pending] = [before[3], before[5], before[7]];
    if (!confirmed || !expired || !pending) throw new Error('expected at least 8 slots');

    const booking = (slot: Slot, status: 'confirmed' | 'pending', expiresAt: Date | null) => ({
      specialistId: owner.userId,
      clientId: client.userId,
      serviceId: owner.serviceId,
      serviceName: 'Консультация',
      startAt: new Date(slot.start),
      endAt: new Date(slot.end),
      status,
      expiresAt,
    });
    await testApp.database.db.insert(bookings).values([
      booking(confirmed, 'confirmed', null),
      // The expiry job has not run yet, but the booking no longer takes the time
      booking(expired, 'pending', new Date(Date.now() - HOUR)),
      booking(pending, 'pending', new Date(Date.now() + DAY)),
    ]);

    const after = items(await getSlots(owner.slug, { serviceId: owner.serviceId, ...range }));
    const starts = after.map((s) => s.start);
    expect(starts).not.toContain(confirmed.start);
    expect(starts).not.toContain(pending.start);
    expect(starts).toContain(expired.start);
    expect(after).toHaveLength(before.length - 2);
  });

  it('counts a booking just past the range end against the last slot', async () => {
    const owner = await specialist();
    const client = await signedInUser(server, testApp.database.db);
    const range = week();
    const slot = items(await getSlots(owner.slug, { serviceId: owner.serviceId, ...range }))[2];
    if (!slot) throw new Error('expected slots');

    // The slot starts inside [from, to) and the booking starts exactly at `to`
    const to = new Date(Date.parse(slot.start) + HOUR / 2);
    await testApp.database.db.insert(bookings).values({
      specialistId: owner.userId,
      clientId: client.userId,
      serviceId: owner.serviceId,
      serviceName: 'Консультация',
      startAt: to,
      endAt: new Date(to.getTime() + HOUR / 2),
      status: 'confirmed',
    });

    const response = await getSlots(owner.slug, {
      serviceId: owner.serviceId,
      from: range.from,
      to: to.toISOString(),
    });
    expect(items(response).map((s) => s.start)).not.toContain(slot.start);
  });

  it('skips days off in the specialist time zone', async () => {
    const owner = await specialist();
    const range = week();
    const first = items(await getSlots(owner.slug, { serviceId: owner.serviceId, ...range }))[0];
    if (!first) throw new Error('expected slots');
    const dayOff = toLocalDateTime(new Date(first.start), ZONE).date;
    await owner.c.post('/me/days-off', { date: dayOff }).expect(201);

    const after = items(await getSlots(owner.slug, { serviceId: owner.serviceId, ...range }));
    expect(after.length).toBeGreaterThan(0);
    expect(after.map((s) => toLocalDateTime(new Date(s.start), ZONE).date)).not.toContain(dayOff);
  });

  it('treats missing, foreign and archived services as missing', async () => {
    const owner = await specialist();
    const other = await specialist();
    const range = week();

    const unknownSlug = await getSlots(
      'no-such-specialist',
      { serviceId: owner.serviceId, ...range },
      404,
    );
    expect(unknownSlug.body).toMatchObject({ code: 'NOT_FOUND' });
    await getSlots(owner.slug, { serviceId: other.serviceId, ...range }, 404);
    await getSlots(owner.slug, { serviceId: randomUUID(), ...range }, 404);

    await owner.c.post(`/me/services/${owner.serviceId}/archive`).expect(204);
    await getSlots(owner.slug, { serviceId: owner.serviceId, ...range }, 404);
  });

  it('validates the range', async () => {
    const { slug, serviceId } = await specialist();
    const from = new Date(Date.now() + DAY);
    const plus = (days: number) => new Date(from.getTime() + days * DAY).toISOString();

    const tooLong = await getSlots(
      slug,
      { serviceId, from: from.toISOString(), to: plus(32) },
      400,
    );
    expect(tooLong.body).toMatchObject({ code: 'VALIDATION_FAILED', errors: [{ path: 'to' }] });
    await getSlots(slug, { serviceId, from: from.toISOString(), to: plus(31) }, 200);
    await getSlots(slug, { serviceId, from: plus(1), to: plus(1) }, 400);
    await getSlots(slug, { serviceId, from: '2026-11-16', to: plus(1) }, 400);
    await getSlots(slug, { serviceId: 'not-a-uuid', from: from.toISOString(), to: plus(1) }, 400);
    await getSlots(slug, { from: from.toISOString(), to: plus(1) }, 400);
  });
});
