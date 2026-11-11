import { Injectable } from '@nestjs/common';
import { and, count, eq, gt, inArray, lte, or, sql } from 'drizzle-orm';
import type { Database, Tx } from '../../infrastructure/database/database.module';
import { PgErrorCode, pgErrorCode } from '../../infrastructure/database/pg-errors';
import {
  bookings,
  type BookingRow,
  type BookingStatus,
  type NewBookingRow,
} from './bookings.schema';
import { BookingConflictError } from './domain/errors';

type Executor = Database | Tx;

const overlaps = (startAt: Date, endAt: Date) =>
  sql`tstzrange(${bookings.startAt}, ${bookings.endAt}, '[)') && tstzrange(${startAt}::timestamptz, ${endAt}::timestamptz, '[)')`;

@Injectable()
export class BookingsRepository {
  /**
   * Serializes booking attempts for one specialist until the transaction ends.
   * Without it, concurrent inserts wait on each other's uncommitted tuples in the
   * exclusion index and PostgreSQL resolves the cycle as a deadlock (40P01) after
   * `deadlock_timeout`. The constraint still guarantees correctness; the lock makes
   * conflicts fast and always reported as 23P01. An advisory lock keeps the bookings
   * module off the specialists' table (ADR-006); hash collisions only add waiting.
   */
  async lockSpecialistSchedule(tx: Tx, specialistId: string): Promise<void> {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${specialistId}, 0))`);
  }

  /**
   * Must run in the same transaction as {@link insert}, right before it (ADR-003):
   * an overdue pending booking is already "free" for slot calculation, but the
   * exclusion constraint still sees it until its status changes.
   */
  async expireOverduePendingOverlapping(
    tx: Tx,
    params: { specialistId: string; startAt: Date; endAt: Date; now: Date },
  ): Promise<number> {
    const expired = await tx
      .update(bookings)
      .set({ status: 'expired', expiresAt: null })
      .where(
        and(
          eq(bookings.specialistId, params.specialistId),
          eq(bookings.status, 'pending'),
          lte(bookings.expiresAt, params.now),
          overlaps(params.startAt, params.endAt),
        ),
      )
      .returning({ id: bookings.id });
    return expired.length;
  }

  /**
   * Time taken by active bookings overlapping [from, to): confirmed, and pending that has
   * not expired by `now` — the effective status (ADR-003), even if the expiry job has not
   * updated the row yet. The status filter repeats the exclusion constraint's predicate so
   * that its GiST index serves the range search.
   */
  async listBusy(
    db: Executor,
    params: { specialistId: string; from: Date; to: Date; now: Date },
  ): Promise<{ start: Date; end: Date }[]> {
    return db
      .select({ start: bookings.startAt, end: bookings.endAt })
      .from(bookings)
      .where(
        and(
          eq(bookings.specialistId, params.specialistId),
          inArray(bookings.status, ['pending', 'confirmed']),
          or(eq(bookings.status, 'confirmed'), gt(bookings.expiresAt, params.now)),
          overlaps(params.from, params.to),
        ),
      );
  }

  /**
   * Pending bookings of a client with a specialist that have not expired by `now` (FR-56).
   * Count-then-insert is a race between concurrent requests; it is safe only under
   * {@link lockSpecialistSchedule}, taken before the count.
   */
  async countActivePending(
    tx: Tx,
    params: { clientId: string; specialistId: string; now: Date },
  ): Promise<number> {
    const [row] = await tx
      .select({ n: count() })
      .from(bookings)
      .where(
        and(
          eq(bookings.clientId, params.clientId),
          eq(bookings.specialistId, params.specialistId),
          eq(bookings.status, 'pending'),
          gt(bookings.expiresAt, params.now),
        ),
      );
    return row?.n ?? 0;
  }

  /** @throws BookingConflictError when the interval overlaps an active booking. */
  async insert(tx: Tx, row: NewBookingRow): Promise<BookingRow> {
    try {
      const [created] = await tx.insert(bookings).values(row).returning();
      if (!created) throw new Error('INSERT ... RETURNING returned no row');
      return created;
    } catch (error) {
      if (pgErrorCode(error) === PgErrorCode.exclusionViolation) {
        throw new BookingConflictError();
      }
      throw error;
    }
  }

  /**
   * Compare-and-set status transition (data-model.md §4): updates only if the
   * booking is still in `from` (and, for pending, not yet expired).
   * Returns `null` when someone else changed the booking first.
   */
  async transitionStatus(
    executor: Executor,
    params: {
      id: string;
      from: BookingStatus;
      now: Date;
      set: Pick<NewBookingRow, 'status'> &
        Partial<Pick<NewBookingRow, 'cancelledBy' | 'statusReason' | 'expiresAt'>>;
    },
  ): Promise<BookingRow | null> {
    const [updated] = await executor
      .update(bookings)
      .set(params.set)
      .where(
        and(
          eq(bookings.id, params.id),
          eq(bookings.status, params.from),
          params.from === 'pending' ? gt(bookings.expiresAt, params.now) : undefined,
        ),
      )
      .returning();
    return updated ?? null;
  }
}
