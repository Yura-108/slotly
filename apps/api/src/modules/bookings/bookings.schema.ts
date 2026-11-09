import { sql } from 'drizzle-orm';
import { check, index, pgEnum, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { idColumn, timestampColumns, timestamptz } from '../../infrastructure/database/columns';
import { services } from '../services/services.schema';
import { specialistProfiles } from '../specialists/specialists.schema';
import { users } from '../users/users.schema';

export const bookingStatus = pgEnum('booking_status', [
  'pending',
  'confirmed',
  'rejected',
  'cancelled',
  'expired',
]);

export const bookingActor = pgEnum('booking_actor', ['client', 'specialist']);

/**
 * Overlap protection is an exclusion constraint that Drizzle cannot express;
 * it lives in a custom SQL migration (ADR-003): `bookings_no_overlap`.
 */
export const bookings = pgTable(
  'bookings',
  {
    id: idColumn(),
    specialistId: uuid('specialist_id')
      .notNull()
      .references(() => specialistProfiles.userId),
    clientId: uuid('client_id')
      .notNull()
      .references(() => users.id),
    serviceId: uuid('service_id')
      .notNull()
      .references(() => services.id, { onDelete: 'restrict' }),
    // Snapshot at booking time: a booking is a fact, not derived data
    serviceName: text('service_name').notNull(),
    startAt: timestamptz('start_at').notNull(),
    endAt: timestamptz('end_at').notNull(),
    status: bookingStatus('status').notNull(),
    expiresAt: timestamptz('expires_at'),
    cancelledBy: bookingActor('cancelled_by'),
    statusReason: text('status_reason'),
    ...timestampColumns(),
  },
  (t) => [
    check('bookings_end_after_start', sql`${t.endAt} > ${t.startAt}`),
    check('bookings_not_self', sql`${t.clientId} <> ${t.specialistId}`),
    check(
      'bookings_expires_only_pending',
      sql`(${t.status} = 'pending') = (${t.expiresAt} is not null)`,
    ),
    check(
      'bookings_cancelled_by_only_cancelled',
      sql`(${t.status} = 'cancelled') = (${t.cancelledBy} is not null)`,
    ),
    check('bookings_status_reason_length', sql`char_length(${t.statusReason}) <= 500`),
    index('bookings_client_start_idx').on(t.clientId, t.startAt),
    index('bookings_specialist_start_idx').on(t.specialistId, t.startAt),
    index('bookings_pending_expiry_idx')
      .on(t.expiresAt)
      .where(sql`${t.status} = 'pending'`),
  ],
);

export type BookingRow = typeof bookings.$inferSelect;
export type NewBookingRow = typeof bookings.$inferInsert;
export type BookingStatus = (typeof bookingStatus.enumValues)[number];
