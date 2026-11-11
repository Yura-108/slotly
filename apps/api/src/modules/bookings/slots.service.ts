import { Inject, Injectable } from '@nestjs/common';
import { DATABASE, type Database } from '../../infrastructure/database/database.module';
import { toLocalDateTime } from '../../shared/zoned-time';
import { SchedulingService } from '../scheduling/scheduling.service';
import { ServicesService } from '../services/services.service';
import { SpecialistsService } from '../specialists/specialists.service';
import { BookingsRepository } from './bookings.repository';
import { calculateSlots, type TimeRange } from './domain/calculate-slots';

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

    // Local dates of the specialist that the range touches, for the days-off lookup
    const fromDate = toLocalDateTime(range.start, profile.timezone).date;
    const toDate = toLocalDateTime(range.end, profile.timezone).date;
    const [availability, busy] = await Promise.all([
      this.scheduling.getAvailability(profile.userId, fromDate, toDate),
      this.bookings.listBusy(this.db, {
        specialistId: profile.userId,
        from: range.start,
        // A slot starting just before range.end runs past it: bookings there count too
        to: new Date(range.end.getTime() + service.durationMinutes * 60_000),
        now,
      }),
    ]);

    return calculateSlots({
      timeZone: profile.timezone,
      intervals: availability.intervals,
      daysOff: new Set(availability.daysOff),
      busy,
      durationMinutes: service.durationMinutes,
      minNoticeMinutes: profile.minNoticeMinutes,
      bookingHorizonDays: profile.bookingHorizonDays,
      range,
      now,
    });
  }
}
