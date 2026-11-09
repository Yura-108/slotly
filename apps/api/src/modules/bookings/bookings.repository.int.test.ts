import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PgErrorCode, pgErrorCode } from '../../infrastructure/database/pg-errors';
import { createSpecialistWithService, createUser } from '../../test-utils/fixtures';
import { startTestDatabase, type TestDatabase } from '../../test-utils/postgres';
import { BookingsRepository } from './bookings.repository';
import { bookings, type NewBookingRow } from './bookings.schema';
import { BookingConflictError } from './domain/errors';

const at = (iso: string) => new Date(iso);
const HOUR = 60 * 60 * 1000;

describe('BookingsRepository (PostgreSQL)', () => {
  let testDb: TestDatabase;
  const repo = new BookingsRepository();

  beforeAll(async () => {
    testDb = await startTestDatabase();
  });

  afterAll(async () => {
    await testDb?.stop();
  });

  async function setup() {
    const { db } = testDb;
    const specialist = await createSpecialistWithService(db);
    const client = await createUser(db);
    const row = (startAt: Date, overrides: Partial<NewBookingRow> = {}): NewBookingRow => ({
      specialistId: specialist.specialistId,
      clientId: client.id,
      serviceId: specialist.serviceId,
      serviceName: specialist.serviceName,
      startAt,
      endAt: new Date(startAt.getTime() + HOUR),
      status: 'confirmed',
      ...overrides,
    });
    /** The booking transaction exactly as the use case will run it (ADR-003). */
    const book = (r: NewBookingRow, now = at('2030-01-01T00:00:00Z')) =>
      db.transaction(async (tx) => {
        await repo.lockSpecialistSchedule(tx, r.specialistId);
        await repo.expireOverduePendingOverlapping(tx, {
          specialistId: r.specialistId,
          startAt: r.startAt,
          endAt: r.endAt,
          now,
        });
        return repo.insert(tx, r);
      });
    return { db, specialist, client, row, book };
  }

  // Several rounds: interleavings differ between runs, and a deadlock (40P01) only
  // showed up in some of them before lockSpecialistSchedule was added
  it('lets exactly one of many concurrent bookings of the same time succeed', async () => {
    for (let round = 0; round < 10; round++) {
      const { db, specialist, row, book } = await setup();
      const clients = await Promise.all(Array.from({ length: 20 }, () => createUser(db)));
      const startAt = at('2030-01-07T10:00:00Z');

      const results = await Promise.allSettled(
        clients.map((c) => book(row(startAt, { clientId: c.id }))),
      );

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(19);
      for (const r of rejected) expect(r.reason).toBeInstanceOf(BookingConflictError);

      const stored = await db
        .select()
        .from(bookings)
        .where(eq(bookings.specialistId, specialist.specialistId));
      expect(stored).toHaveLength(1);
    }
  });

  it('rejects partially overlapping intervals but allows adjacent ones', async () => {
    const { row, book } = await setup();
    await book(row(at('2030-01-07T10:00:00Z')));

    await expect(book(row(at('2030-01-07T10:30:00Z')))).rejects.toBeInstanceOf(
      BookingConflictError,
    );
    // Half-open [start, end): 11:00–12:00 touches 10:00–11:00 but does not overlap it
    await expect(book(row(at('2030-01-07T11:00:00Z')))).resolves.toMatchObject({
      status: 'confirmed',
    });
  });

  it('does not block time with inactive (cancelled) bookings', async () => {
    const { row, book } = await setup();
    const startAt = at('2030-01-07T10:00:00Z');
    await book(row(startAt, { status: 'cancelled', cancelledBy: 'client' }));

    await expect(book(row(startAt))).resolves.toMatchObject({ status: 'confirmed' });
  });

  it('expires an overdue pending booking in the same transaction and books its time', async () => {
    const { db, row, book } = await setup();
    const startAt = at('2030-01-07T10:00:00Z');
    const expiresAt = at('2030-01-05T10:00:00Z');
    const stale = await book(row(startAt, { status: 'pending', expiresAt }));

    // Before the deadline the pending booking still holds the time
    await expect(book(row(startAt), at('2030-01-05T09:59:00Z'))).rejects.toBeInstanceOf(
      BookingConflictError,
    );

    // After the deadline it is expired on the fly and the new booking succeeds
    const fresh = await book(row(startAt), at('2030-01-05T10:01:00Z'));
    expect(fresh.status).toBe('confirmed');
    const [old] = await db.select().from(bookings).where(eq(bookings.id, stale.id));
    expect(old).toMatchObject({ status: 'expired', expiresAt: null });
  });

  it('applies only one of two concurrent status transitions (compare-and-set)', async () => {
    const { db, row, book } = await setup();
    const now = at('2030-01-01T00:00:00Z');
    const pending = await book(
      row(at('2030-01-07T10:00:00Z'), { status: 'pending', expiresAt: at('2030-01-02T00:00:00Z') }),
    );

    const [confirmed, cancelled] = await Promise.all([
      repo.transitionStatus(db, {
        id: pending.id,
        from: 'pending',
        now,
        set: { status: 'confirmed', expiresAt: null },
      }),
      repo.transitionStatus(db, {
        id: pending.id,
        from: 'pending',
        now,
        set: { status: 'cancelled', expiresAt: null, cancelledBy: 'client' },
      }),
    ]);

    // Exactly one wins; the loser gets null (→ BOOKING_STATUS_CHANGED in the use case)
    expect([confirmed, cancelled].filter((r) => r !== null)).toHaveLength(1);
  });

  it('refuses to confirm a pending booking whose deadline has passed', async () => {
    const { row, book } = await setup();
    const pending = await book(
      row(at('2030-01-07T10:00:00Z'), { status: 'pending', expiresAt: at('2030-01-02T00:00:00Z') }),
    );

    const result = await repo.transitionStatus(testDb.db, {
      id: pending.id,
      from: 'pending',
      now: at('2030-01-03T00:00:00Z'),
      set: { status: 'confirmed', expiresAt: null },
    });

    expect(result).toBeNull();
  });

  it('enforces "expires_at only for pending" in the database itself', async () => {
    const { row, book } = await setup();
    const error: unknown = await book(row(at('2030-01-07T10:00:00Z'), { status: 'pending' })).catch(
      (e: unknown) => e,
    );

    expect(pgErrorCode(error)).toBe(PgErrorCode.checkViolation);
  });
});
