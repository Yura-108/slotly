import { Inject, Injectable } from '@nestjs/common';
import { AppConfig } from '../../infrastructure/config/config.schema';
import { DATABASE, type Database } from '../../infrastructure/database/database.module';
import { NotificationsService } from '../notifications/notifications.service';
import { ServicesService } from '../services/services.service';
import { SpecialistsService } from '../specialists/specialists.service';
import { UsersService } from '../users/users.service';
import { BookingsRepository } from './bookings.repository';
import type { BookingRow, BookingStatus } from './bookings.schema';
import { initialStatus, PENDING_LIMIT, pendingExpiresAt } from './domain/booking-policy';
import {
  CannotBookSelfError,
  EmailNotVerifiedError,
  PendingLimitReachedError,
  SlotNotAvailableError,
} from './domain/errors';
import { SlotsService } from './slots.service';

const MINUTE_MS = 60_000;

export interface Booking {
  id: string;
  status: BookingStatus;
  serviceName: string;
  startAt: Date;
  endAt: Date;
  /** Only for pending: when the request expires without an answer. */
  expiresAt: Date | null;
  specialist: { slug: string; displayName: string };
}

/** Public API of the bookings module (ADR-006). */
@Injectable()
export class BookingsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly config: AppConfig,
    private readonly repository: BookingsRepository,
    private readonly slots: SlotsService,
    private readonly users: UsersService,
    private readonly specialists: SpecialistsService,
    private readonly services: ServicesService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * Creates a booking (requirements §4.2, FR-50, FR-51, FR-56). Checks that do not depend
   * on other bookings run first; the transaction then follows ADR-003: lock the specialist,
   * free the time of overdue requests, count pending under the lock, insert (the exclusion
   * constraint decides "taken"), and record both emails in the outbox.
   */
  async create(
    clientId: string,
    input: { serviceId: string; startAt: Date },
    now = new Date(),
  ): Promise<Booking> {
    const client = await this.users.getProfile(clientId);
    if (!client.emailVerified) throw new EmailNotVerifiedError();

    const service = await this.services.getBookable(input.serviceId);
    if (service.specialistId === clientId) throw new CannotBookSelfError();
    const specialist = await this.specialists.getById(service.specialistId);
    if (!(await this.slots.isOffered(specialist, service.durationMinutes, input.startAt, now))) {
      throw new SlotNotAvailableError();
    }
    const specialistUser = await this.users.getProfile(specialist.userId);

    const startAt = input.startAt;
    const endAt = new Date(startAt.getTime() + service.durationMinutes * MINUTE_MS);
    const status = initialStatus(specialist.confirmationMode);

    const row = await this.db.transaction(async (tx) => {
      await this.repository.lockSpecialistSchedule(tx, specialist.userId);
      await this.repository.expireOverduePendingOverlapping(tx, {
        specialistId: specialist.userId,
        startAt,
        endAt,
        now,
      });
      if (status === 'pending') {
        const pending = await this.repository.countActivePending(tx, {
          clientId,
          specialistId: specialist.userId,
          now,
        });
        if (pending >= PENDING_LIMIT) throw new PendingLimitReachedError();
      }

      const created = await this.repository.insert(tx, {
        specialistId: specialist.userId,
        clientId,
        serviceId: service.id,
        serviceName: service.name,
        startAt,
        endAt,
        status,
        expiresAt: status === 'pending' ? pendingExpiresAt(now, startAt) : null,
      });

      const time = {
        serviceName: service.name,
        startAt: startAt.toISOString(),
        endAt: endAt.toISOString(),
        bookingsUrl: `${this.config.appOrigin}/bookings`,
      };
      await this.notifications.enqueue(tx, {
        type: 'booking.new_for_specialist',
        payload: {
          ...time,
          to: specialistUser.email,
          name: specialist.displayName,
          timeZone: specialist.timezone,
          clientName: client.name,
          needsConfirmation: status === 'pending',
        },
      });
      await this.notifications.enqueue(tx, {
        type: 'booking.created_for_client',
        payload: {
          ...time,
          to: client.email,
          name: client.name,
          timeZone: client.timezone,
          specialistName: specialist.displayName,
          status,
        },
      });
      return created;
    });

    return toBooking(row, specialist);
  }
}

function toBooking(row: BookingRow, specialist: { slug: string; displayName: string }): Booking {
  return {
    id: row.id,
    status: row.status,
    serviceName: row.serviceName,
    startAt: row.startAt,
    endAt: row.endAt,
    expiresAt: row.expiresAt,
    specialist: { slug: specialist.slug, displayName: specialist.displayName },
  };
}
