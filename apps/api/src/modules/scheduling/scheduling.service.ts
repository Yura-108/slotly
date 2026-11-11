import { Inject, Injectable } from '@nestjs/common';
import { DATABASE, type Database } from '../../infrastructure/database/database.module';
import { SpecialistsService } from '../specialists/specialists.service';
import { DayOffInPastError, DayOffNotFoundError } from './domain/errors';
import { isPastDate, localDate } from './domain/local-date';
import { sortIntervals, type WeeklyInterval } from './domain/weekly-schedule';
import { SchedulingRepository } from './scheduling.repository';

export type { WeeklyInterval } from './domain/weekly-schedule';

export interface WeeklySchedule {
  /** IANA zone the intervals are interpreted in (the specialist's). */
  timezone: string;
  intervals: WeeklyInterval[];
}

/** Inputs for slot calculation: rules and days off of a specialist (bookings module). */
export interface Availability {
  intervals: WeeklyInterval[];
  /** Local dates of days off in the requested range. */
  daysOff: string[];
}

export interface DayOff {
  id: string;
  date: string;
}

/** Public API of the scheduling module (ADR-006). */
@Injectable()
export class SchedulingService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly repository: SchedulingRepository,
    private readonly specialists: SpecialistsService,
  ) {}

  async getWeeklySchedule(userId: string): Promise<WeeklySchedule> {
    const profile = await this.specialists.requireProfile(userId);
    return {
      timezone: profile.timezone,
      intervals: await this.repository.listIntervals(this.db, profile.userId),
    };
  }

  /**
   * Replaces the whole week atomically. Overlaps are rejected by request validation (400);
   * the exclusion constraint is the backstop. Existing bookings are not affected
   * (requirements §5): a booking is a recorded fact.
   */
  async replaceWeeklySchedule(
    userId: string,
    intervals: readonly WeeklyInterval[],
  ): Promise<WeeklySchedule> {
    const profile = await this.specialists.requireProfile(userId);
    const sorted = sortIntervals(intervals);
    await this.db.transaction(async (tx) => {
      await this.repository.lockWeeklySchedule(tx, profile.userId);
      await this.repository.replaceIntervals(tx, profile.userId, sorted);
    });
    return { timezone: profile.timezone, intervals: sorted };
  }

  /**
   * Rules and days off for slot calculation. Takes the specialist id: the caller has
   * already resolved the public profile, and this read needs no ownership check.
   */
  async getAvailability(
    specialistId: string,
    fromDate: string,
    toDate: string,
  ): Promise<Availability> {
    const [intervals, dates] = await Promise.all([
      this.repository.listIntervals(this.db, specialistId),
      this.repository.listDayOffDatesBetween(this.db, specialistId, fromDate, toDate),
    ]);
    return { intervals, daysOff: dates };
  }

  /** Upcoming days off, from today in the specialist's time zone. */
  async listDaysOff(userId: string, now = new Date()): Promise<DayOff[]> {
    const profile = await this.specialists.requireProfile(userId);
    const rows = await this.repository.listDaysOffFrom(
      this.db,
      profile.userId,
      localDate(now, profile.timezone),
    );
    return rows.map((r) => ({ id: r.id, date: r.date }));
  }

  async addDayOff(userId: string, date: string, now = new Date()): Promise<DayOff> {
    const profile = await this.specialists.requireProfile(userId);
    if (isPastDate(date, now, profile.timezone)) throw new DayOffInPastError();
    const row = await this.repository.insertDayOff(this.db, profile.userId, date);
    return { id: row.id, date: row.date };
  }

  async removeDayOff(userId: string, dayOffId: string): Promise<void> {
    const profile = await this.specialists.requireProfile(userId);
    const deleted = await this.repository.deleteDayOff(this.db, dayOffId, profile.userId);
    if (!deleted) throw new DayOffNotFoundError();
  }
}
