import { Injectable, Logger } from '@nestjs/common';
import { AppConfig } from '../../infrastructure/config/config.schema';
import { PeriodicJob } from '../../infrastructure/jobs/periodic-job';
import { BookingsService } from './bookings.service';

/** FR-54: overdue requests become expired and their clients get an email. */
@Injectable()
export class BookingExpiryJob extends PeriodicJob {
  private readonly log = new Logger(BookingExpiryJob.name);
  protected readonly intervalMs: number;

  constructor(
    config: AppConfig,
    private readonly bookings: BookingsService,
  ) {
    super();
    this.intervalMs = config.jobs.bookingExpiryIntervalMs;
  }

  async run(now: Date): Promise<void> {
    const expired = await this.bookings.expireOverdue(now);
    if (expired > 0) this.log.log({ expired }, 'Expired overdue booking requests');
  }
}
