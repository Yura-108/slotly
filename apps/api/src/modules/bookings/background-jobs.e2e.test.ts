import { randomUUID } from 'node:crypto';
import { eq, inArray, sql } from 'drizzle-orm';
import type { App } from 'supertest/types';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  authTokens,
  bookings,
  outboxMessages,
  sessions,
} from '../../infrastructure/database/schema';
import { startTestApp, type TestApp } from '../../test-utils/app';
import { httpClient, signedInUser } from '../../test-utils/http';
import { AuthCleanupJob } from '../auth/auth-cleanup.job';
import { OutboxCleanupJob } from '../notifications/outbox-cleanup.job';
import { OutboxProcessor } from '../notifications/outbox.processor';
import { BookingExpiryJob } from './booking-expiry.job';
import { BookingsService } from './bookings.service';

let testApp: TestApp;
let server: App;

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

interface Slot {
  start: string;
  end: string;
}

async function specialist() {
  const user = await signedInUser(server, testApp.database.db);
  const c = httpClient(server, user.session);
  const slug = `spec-${randomUUID().slice(0, 8)}`;
  await c
    .post('/me/specialist-profile', { slug, displayName: 'Ирина', timezone: 'Europe/Berlin' })
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

/** A client sends a request for the n-th free slot; returns the client and booking id. */
async function request(owner: Specialist, n: number) {
  const client = await signedInUser(server, testApp.database.db);
  const slot = (await freeSlots(owner))[n];
  if (!slot) throw new Error('expected a free slot');
  const response = await httpClient(server, client.session)
    .post('/bookings', { serviceId: owner.serviceId, startAt: slot.start })
    .expect(201);
  return { client, id: (response.body as { id: string }).id, slot };
}

const makeOverdue = (ids: string[]) =>
  testApp.database.db
    .update(bookings)
    .set({ expiresAt: new Date(Date.now() - HOUR) })
    .where(inArray(bookings.id, ids));

const emailsOfType = (email: string, type: string) =>
  testApp.database.db
    .select()
    .from(outboxMessages)
    .where(sql`${outboxMessages.payload}->>'to' = ${email} and ${outboxMessages.type} = ${type}`);

const statusOf = async (id: string) =>
  (await testApp.database.db.select().from(bookings).where(eq(bookings.id, id)))[0]?.status;

beforeAll(async () => {
  testApp = await startTestApp();
  server = testApp.app.getHttpServer();
});

afterAll(async () => {
  await testApp?.close();
});

describe('booking expiry job (FR-54)', () => {
  it('expires overdue requests once and emails each client once', async () => {
    const owner = await specialist();
    const overdue = await request(owner, 0);
    const fresh = await request(owner, 2);
    await makeOverdue([overdue.id]);

    const job = testApp.app.get(BookingExpiryJob);
    // Three runs at once — as on three instances: SKIP LOCKED + the status condition
    await Promise.all([job.run(new Date()), job.run(new Date()), job.run(new Date())]);
    await job.run(new Date());

    expect(await statusOf(overdue.id)).toBe('expired');
    expect(await statusOf(fresh.id)).toBe('pending');
    const emails = await emailsOfType(overdue.client.email, 'booking.expired');
    expect(emails).toHaveLength(1);
    expect(emails[0]?.payload).toMatchObject({
      specialistName: 'Ирина',
      specialistUrl: `${'http://localhost:3000'}/book/${owner.slug}`,
      timeZone: 'Europe/Moscow',
    });
  });

  it('works through more overdue requests than one batch', async () => {
    const owner = await specialist();
    // One by one: each request reads the free slots, and a parallel booking would shift
    // the indexes under it (two requests for the same slot → 409)
    const requests = [];
    for (const n of [0, 2, 4, 6, 8]) requests.push(await request(owner, n));
    await makeOverdue(requests.map((r) => r.id));

    const expired = await testApp.app.get(BookingsService).expireOverdue(new Date(), 2);
    expect(expired).toBeGreaterThanOrEqual(5);
    for (const r of requests) expect(await statusOf(r.id)).toBe('expired');
  });

  it('emails the client whose overdue request gives its time to a new booking', async () => {
    const owner = await specialist();
    const old = await request(owner, 0);
    await makeOverdue([old.id]);

    const anna = await signedInUser(server, testApp.database.db);
    await httpClient(server, anna.session)
      .post('/bookings', { serviceId: owner.serviceId, startAt: old.slot.start })
      .expect(201);

    expect(await statusOf(old.id)).toBe('expired');
    expect(await emailsOfType(old.client.email, 'booking.expired')).toHaveLength(1);
  });
});

describe('cleanup jobs', () => {
  it('deletes expired sessions and tokens, keeps live ones', async () => {
    const { db } = testApp.database;
    const stale = await signedInUser(server, db, { verified: false });
    const live = await signedInUser(server, db, { verified: false });
    const past = new Date(Date.now() - HOUR);
    await db.update(sessions).set({ expiresAt: past }).where(eq(sessions.userId, stale.userId));
    await db.update(authTokens).set({ expiresAt: past }).where(eq(authTokens.userId, stale.userId));

    await testApp.app.get(AuthCleanupJob).run(new Date());

    const count = async (table: typeof sessions | typeof authTokens, userId: string) =>
      (await db.select().from(table).where(eq(table.userId, userId))).length;
    expect(await count(sessions, stale.userId)).toBe(0);
    expect(await count(authTokens, stale.userId)).toBe(0);
    expect(await count(sessions, live.userId)).toBe(1);
    expect(await count(authTokens, live.userId)).toBe(1); // the email confirmation token
    await httpClient(server, live.session).get('/me').expect(200);
  });

  it('deletes old sent and failed messages by their retention, never pending ones', async () => {
    const { db } = testApp.database;
    const now = Date.now();
    const daysAgo = (d: number) => new Date(now - d * DAY);
    const marker = `cleanup-${randomUUID()}@example.test`;
    const rows = [
      { label: 'sent 31d', status: 'sent' as const, processedAt: daysAgo(31) },
      { label: 'sent 29d', status: 'sent' as const, processedAt: daysAgo(29) },
      { label: 'failed 31d', status: 'failed' as const, processedAt: daysAgo(31) },
      { label: 'failed 91d', status: 'failed' as const, processedAt: daysAgo(91) },
      { label: 'pending', status: 'pending' as const, processedAt: null },
    ];
    await db.insert(outboxMessages).values(
      rows.map((r) => ({
        type: 'auth.verify_email',
        payload: { to: marker, label: r.label },
        status: r.status,
        processedAt: r.processedAt,
        createdAt: daysAgo(100),
      })),
    );

    await testApp.app.get(OutboxCleanupJob).run(new Date(now));

    const left = await db
      .select()
      .from(outboxMessages)
      .where(sql`${outboxMessages.payload}->>'to' = ${marker}`);
    expect(left.map((m) => (m.payload as { label: string }).label).sort()).toEqual([
      'failed 31d',
      'pending',
      'sent 29d',
    ]);
  });
});

describe('email failures do not undo bookings (FR-62)', () => {
  it('keeps the booking and schedules the emails for a retry when SMTP is down', async () => {
    // The test app sends to an unreachable SMTP server (test-utils/app.ts)
    const owner = await specialist();
    const { client, id } = await request(owner, 0);

    // Batches of 10: earlier tests' emails are due first, so drain the queue
    const now = new Date();
    const processor = testApp.app.get(OutboxProcessor);
    let retried = 0;
    for (;;) {
      const batch = await processor.processDue(now);
      retried += batch.retried;
      if (batch.sent + batch.retried + batch.failed === 0) break;
    }
    expect(retried).toBeGreaterThanOrEqual(2);

    expect(await statusOf(id)).toBe('pending');
    const [toClient] = await emailsOfType(client.email, 'booking.created_for_client');
    expect(toClient).toMatchObject({ status: 'pending', attempts: 1 });
    expect(toClient!.nextAttemptAt.getTime()).toBeGreaterThan(now.getTime());
    // The client still sees the booking, whatever happened to the email
    await httpClient(server, client.session).get(`/bookings/${id}`).expect(200);
  });
});
