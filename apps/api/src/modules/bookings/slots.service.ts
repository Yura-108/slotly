import { Inject, Injectable } from '@nestjs/common';
import { DATABASE, type Database } from '../../infrastructure/database/database.module';
import { toLocalDateTime } from '../../shared/zoned-time';
import { SchedulingService } from '../scheduling/scheduling.service';
import { ServicesService } from '../services/services.service';
import { type SpecialistProfile, SpecialistsService } from '../specialists/specialists.service';
import { BookingsRepository } from './bookings.repository';
import { calculateSlots, type TimeRange } from './domain/calculate-slots';

const MINUTE_MS = 60_000;

/**
 * "Where can a client book" is a booking question (backend.md §2, rule 4): this use case
 * gathers inputs from the owning modules and leaves the decision to the pure domain.
 */
@Injectable()
export class SlotsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly bookings: BookingsRepository,
    private readonly specialists: SpecialistsService,
    private readonly services: ServicesService,
    private readonly scheduling: SchedulingService,
  ) {}

  async findFree(
    slug: string,
    serviceId: string,
    range: TimeRange,
    now = new Date(),
  ): Promise<TimeRange[]> {
    const profile = await this.specialists.getBySlug(slug);
    const service = await this.services.getActiveOf(profile.userId, serviceId);
    const busy = await this.bookings.listBusy(this.db, {
      specialistId: profile.userId,
      from: range.start,
      // A slot starting just before range.end runs past it: bookings there count too
      to: new Date(range.end.getTime() + service.durationMinutes * MINUTE_MS),
      now,
    });
    return this.calculate(profile, service.durationMinutes, range, busy, now);
  }

  /**
   * Whether `startAt` is a slot the specialist offers — the same calculation the client saw,
   * so what is shown and what is accepted cannot drift apart. Busy time is left out on
   * purpose: whether the slot is taken is decided atomically by the database (ADR-003).
   */
  async isOffered(
    specialist: SpecialistProfile,
    durationMinutes: number,
    startAt: Date,
    now: Date,
  ): Promise<boolean> {
    const range = { start: startAt, end: new Date(startAt.getTime() + MINUTE_MS) };
    const slots = await this.calculate(specialist, durationMinutes, range, [], now);
    return slots.some((s) => s.start.getTime() === startAt.getTime());
  }

  private async calculate(
    specialist: SpecialistProfile,
    durationMinutes: number,
    range: TimeRange,
    busy: readonly TimeRange[],
    now: Date,
  ): Promise<TimeRange[]> {
    // Local dates of the specialist that the range touches, for the days-off lookup
    const availability = await this.scheduling.getAvailability(
      specialist.userId,
      toLocalDateTime(range.start, specialist.timezone).date,
      toLocalDateTime(range.end, specialist.timezone).date,
    );
    return calculateSlots({
      timeZone: specialist.timezone,
      intervals: availability.intervals,
      daysOff: new Set(availability.daysOff),
      busy,
      durationMinutes,
      minNoticeMinutes: specialist.minNoticeMinutes,
      bookingHorizonDays: specialist.bookingHorizonDays,
      range,
      now,
    });
  }
}
