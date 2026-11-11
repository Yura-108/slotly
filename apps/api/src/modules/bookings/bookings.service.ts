import { Inject, Injectable } from '@nestjs/common';
import { AppConfig } from '../../infrastructure/config/config.schema';
import { DATABASE, type Database } from '../../infrastructure/database/database.module';
import { NotificationsService, type OutboxMessage } from '../notifications/notifications.service';
import { ServicesService } from '../services/services.service';
import { type SpecialistCard, SpecialistsService } from '../specialists/specialists.service';
import { UsersService } from '../users/users.service';
import { BookingsRepository } from './bookings.repository';
import type { BookingRow, NewBookingRow } from './bookings.schema';
import { initialStatus, PENDING_LIMIT, pendingExpiresAt } from './domain/booking-policy';
import {
  allowedActions,
  type BookingAction,
  type BookingStatus,
  cancelDeadlineAt,
  effectiveStatus,
  type Party,
  refusal,
} from './domain/booking-status';
import {
  BookingActionForbiddenError,
  BookingAlreadyStartedError,
  BookingNotFoundError,
  BookingStatusChangedError,
  CancelDeadlinePassedError,
  CannotBookSelfError,
  EmailNotVerifiedError,
  PendingLimitReachedError,
  SlotNotAvailableError,
} from './domain/errors';
import { SlotsService } from './slots.service';

const MINUTE_MS = 60_000;

/** A booking as one of its parties sees it, with what that party can do now (ADR-009). */
export interface BookingView {
  id: string;
  /** Effective: an overdue request is "expired" even before the row is updated. */
  status: BookingStatus;
  serviceName: string;
  startAt: Date;
  endAt: Date;
  expiresAt: Date | null;
  cancelDeadlineAt: Date;
  cancelledBy: Party | null;
  statusReason: string | null;
  /** The viewer's side of the booking. */
  party: Party;
  specialist: SpecialistCard;
  client: { name: string };
  allowedActions: BookingAction[];
}

export interface BookingListQuery {
  party: Party;
  scope: 'upcoming' | 'past';
  status?: BookingStatus;
  limit: number;
  offset: number;
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
  ): Promise<BookingView> {
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
        // The rule of this moment becomes part of the agreement (FR-53)
        cancelDeadlineAt: cancelDeadlineAt(startAt, specialist.clientCancelDeadlineHours),
      });

      const time = this.emailTime(created);
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

    return toView(row, 'client', specialist, client.name, now);
  }

  async get(userId: string, bookingId: string, now = new Date()): Promise<BookingView> {
    const row = await this.repository.findForParty(this.db, bookingId, userId);
    if (!row) throw new BookingNotFoundError();
    const [view] = await this.views([row], partyOf(row, userId), now);
    if (!view) throw new BookingNotFoundError();
    return view;
  }

  /** FR-55: the user's bookings as client or as specialist. */
  async list(
    userId: string,
    query: BookingListQuery,
    now = new Date(),
  ): Promise<{ items: BookingView[]; total: number }> {
    const { rows, total } = await this.repository.list(this.db, { userId, ...query, now });
    return { items: await this.views(rows, query.party, now), total };
  }

  /**
   * Confirm, reject or cancel (FR-52, FR-53). The domain decides whether the action is
   * allowed for this party now; the compare-and-set UPDATE then applies it only if the
   * status is still the one that was checked (data-model.md §4) — otherwise 409.
   */
  async act(
    userId: string,
    bookingId: string,
    action: BookingAction,
    reason: string | null,
    now = new Date(),
  ): Promise<BookingView> {
    const row = await this.repository.findForParty(this.db, bookingId, userId);
    if (!row) throw new BookingNotFoundError();
    const party = partyOf(row, userId);
    throwRefusal(refusal(row, party, action, now));

    const [client, specialistUser, specialist] = await Promise.all([
      this.users.getProfile(row.clientId),
      this.users.getProfile(row.specialistId),
      this.specialists.getById(row.specialistId),
    ]);

    const updated = await this.db.transaction(async (tx) => {
      const changed = await this.repository.transitionStatus(tx, {
        id: row.id,
        from: row.status,
        now,
        set: transitionChanges(action, party, reason),
      });
      if (!changed) throw new BookingStatusChangedError();

      const time = this.emailTime(changed);
      const withReason = reason ? { reason } : {};
      const toClient = {
        ...time,
        to: client.email,
        name: client.name,
        timeZone: client.timezone,
      };
      let message: OutboxMessage;
      if (action === 'confirm') {
        message = {
          type: 'booking.confirmed',
          payload: { ...toClient, specialistName: specialist.displayName },
        };
      } else if (action === 'reject') {
        message = {
          type: 'booking.rejected',
          payload: { ...toClient, specialistName: specialist.displayName, ...withReason },
        };
      } else if (party === 'specialist') {
        message = {
          type: 'booking.cancelled',
          payload: {
            ...toClient,
            cancelledBy: 'specialist',
            byName: specialist.displayName,
            ...withReason,
          },
        };
      } else {
        message = {
          type: 'booking.cancelled',
          payload: {
            ...time,
            to: specialistUser.email,
            name: specialist.displayName,
            timeZone: specialist.timezone,
            cancelledBy: 'client',
            byName: client.name,
            ...withReason,
          },
        };
      }
      await this.notifications.enqueue(tx, message);
      return changed;
    });

    return toView(updated, party, specialist, client.name, now);
  }

  private emailTime(row: BookingRow) {
    return {
      serviceName: row.serviceName,
      startAt: row.startAt.toISOString(),
      endAt: row.endAt.toISOString(),
      bookingsUrl: `${this.config.appOrigin}/bookings`,
    };
  }

  /** Names of the other parties come from their owners in one query each, not per row. */
  private async views(rows: BookingRow[], party: Party, now: Date): Promise<BookingView[]> {
    const [cards, names] = await Promise.all([
      this.specialists.getCards(rows.map((r) => r.specialistId)),
      this.users.getNames(rows.map((r) => r.clientId)),
    ]);
    return rows.map((row) =>
      toView(
        row,
        party,
        cards.get(row.specialistId) ?? { slug: '', displayName: '' },
        names.get(row.clientId) ?? '',
        now,
      ),
    );
  }
}

const partyOf = (row: BookingRow, userId: string): Party =>
  row.clientId === userId ? 'client' : 'specialist';

function throwRefusal(reason: ReturnType<typeof refusal>): void {
  switch (reason) {
    case null:
      return;
    case 'forbidden':
      throw new BookingActionForbiddenError();
    case 'started':
      throw new BookingAlreadyStartedError();
    case 'deadline_passed':
      throw new CancelDeadlinePassedError();
    case 'status_changed':
      throw new BookingStatusChangedError();
  }
}

/** Column changes of each transition; the CHECKs keep expires_at and cancelled_by in sync. */
function transitionChanges(
  action: BookingAction,
  party: Party,
  reason: string | null,
): Pick<NewBookingRow, 'status'> &
  Partial<Pick<NewBookingRow, 'cancelledBy' | 'statusReason' | 'expiresAt'>> {
  switch (action) {
    case 'confirm':
      return { status: 'confirmed', expiresAt: null };
    case 'reject':
      return { status: 'rejected', expiresAt: null, statusReason: reason };
    case 'cancel':
      return { status: 'cancelled', expiresAt: null, cancelledBy: party, statusReason: reason };
  }
}

function toView(
  row: BookingRow,
  party: Party,
  specialist: SpecialistCard,
  clientName: string,
  now: Date,
): BookingView {
  return {
    id: row.id,
    status: effectiveStatus(row, now),
    serviceName: row.serviceName,
    startAt: row.startAt,
    endAt: row.endAt,
    expiresAt: row.expiresAt,
    cancelDeadlineAt: row.cancelDeadlineAt,
    cancelledBy: row.cancelledBy,
    statusReason: row.statusReason,
    party,
    specialist: { slug: specialist.slug, displayName: specialist.displayName },
    client: { name: clientName },
    allowedActions: allowedActions(row, party, now),
  };
}
