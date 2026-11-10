import { Injectable } from '@nestjs/common';
import { and, asc, eq, gte, sql } from 'drizzle-orm';
import type { Executor, Tx } from '../../infrastructure/database/database.module';
import { PgErrorCode, pgConstraint, pgErrorCode } from '../../infrastructure/database/pg-errors';
import { DayOffExistsError, ScheduleOverlapError } from './domain/errors';
import type { WeeklyInterval } from './domain/weekly-schedule';
import { type DayOffRow, daysOff, weeklyAvailability } from './scheduling.schema';

@Injectable()
export class SchedulingRepository {
  /**
   * Serializes schedule replacements of one specialist (two tabs saving at once): without
   * it, each transaction deletes only the rows it can see and both inserts collide on the
   * exclusion constraint. Its own key namespace keeps it out of the booking lock's queue.
   */
  async lockWeeklySchedule(tx: Tx, specialistId: string): Promise<void> {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`weekly_availability:${specialistId}`}, 0))`,
    );
  }

  async listIntervals(db: Executor, specialistId: string): Promise<WeeklyInterval[]> {
    const rows = await db
      .select()
      .from(weeklyAvailability)
      .where(eq(weeklyAvailability.specialistId, specialistId))
      .orderBy(asc(weeklyAvailability.weekday), asc(weeklyAvailability.startMinute));
    return rows.map((r) => ({
      weekday: r.weekday as WeeklyInterval['weekday'],
      startMinute: r.startMinute,
      endMinute: r.endMinute,
    }));
  }

  /** Delete + insert in the caller's transaction: the week is replaced as a whole or not at all. */
  async replaceIntervals(
    tx: Tx,
    specialistId: string,
    intervals: readonly WeeklyInterval[],
  ): Promise<void> {
    await tx.delete(weeklyAvailability).where(eq(weeklyAvailability.specialistId, specialistId));
    if (intervals.length === 0) return;
    try {
      await tx.insert(weeklyAvailability).values(intervals.map((i) => ({ specialistId, ...i })));
    } catch (error) {
      if (pgErrorCode(error) === PgErrorCode.exclusionViolation) throw new ScheduleOverlapError();
      throw error;
    }
  }

  async listDaysOffFrom(
    db: Executor,
    specialistId: string,
    fromDate: string,
  ): Promise<DayOffRow[]> {
    return db
      .select()
      .from(daysOff)
      .where(and(eq(daysOff.specialistId, specialistId), gte(daysOff.date, fromDate)))
      .orderBy(asc(daysOff.date));
  }

  async insertDayOff(db: Executor, specialistId: string, date: string): Promise<DayOffRow> {
    try {
      const [row] = await db.insert(daysOff).values({ specialistId, date }).returning();
      if (!row) throw new Error('INSERT ... RETURNING returned no row');
      return row;
    } catch (error) {
      if (
        pgErrorCode(error) === PgErrorCode.uniqueViolation &&
        pgConstraint(error) === 'days_off_specialist_date_unique'
      ) {
        throw new DayOffExistsError();
      }
      throw error;
    }
  }

  /** Owner condition in the query: someone else's day off is "not found". */
  async deleteDayOff(db: Executor, id: string, specialistId: string): Promise<boolean> {
    const rows = await db
      .delete(daysOff)
      .where(and(eq(daysOff.id, id), eq(daysOff.specialistId, specialistId)))
      .returning({ id: daysOff.id });
    return rows.length > 0;
  }
}
