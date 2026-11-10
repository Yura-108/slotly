import { sql } from 'drizzle-orm';
import { check, integer, pgEnum, pgTable, text, unique, uuid } from 'drizzle-orm/pg-core';
import { timestampColumns } from '../../infrastructure/database/columns';
import { users } from '../users/users.schema';

export const confirmationMode = pgEnum('confirmation_mode', ['auto', 'manual']);

export const specialistProfiles = pgTable(
  'specialist_profiles',
  {
    // PK is also the FK: a user physically cannot have two profiles (1 : 0..1)
    userId: uuid('user_id')
      .primaryKey()
      .references(() => users.id, { onDelete: 'cascade' }),
    slug: text('slug').notNull(),
    displayName: text('display_name').notNull(),
    bio: text('bio'),
    timezone: text('timezone').notNull(),
    confirmationMode: confirmationMode('confirmation_mode').notNull().default('manual'),
    minNoticeMinutes: integer('min_notice_minutes').notNull().default(120),
    bookingHorizonDays: integer('booking_horizon_days').notNull().default(60),
    clientCancelDeadlineHours: integer('client_cancel_deadline_hours').notNull().default(24),
    ...timestampColumns(),
  },
  (t) => [
    unique('specialist_profiles_slug_unique').on(t.slug),
    check('specialist_profiles_slug_format', sql`${t.slug} ~ '^[a-z0-9-]{3,40}$'`),
    check(
      'specialist_profiles_display_name_length',
      sql`char_length(${t.displayName}) between 1 and 100`,
    ),
    check('specialist_profiles_bio_length', sql`char_length(${t.bio}) <= 2000`),
    check('specialist_profiles_min_notice_range', sql`${t.minNoticeMinutes} between 0 and 10080`),
    check('specialist_profiles_horizon_range', sql`${t.bookingHorizonDays} between 1 and 365`),
    check(
      'specialist_profiles_cancel_deadline_range',
      sql`${t.clientCancelDeadlineHours} between 0 and 720`,
    ),
  ],
);

export type SpecialistProfileRow = typeof specialistProfiles.$inferSelect;
export type NewSpecialistProfileRow = typeof specialistProfiles.$inferInsert;
export type ConfirmationMode = (typeof confirmationMode.enumValues)[number];
