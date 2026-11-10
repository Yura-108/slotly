import { sql } from 'drizzle-orm';
import { check, date, pgTable, smallint, unique, uuid } from 'drizzle-orm/pg-core';
import { idColumn, timestamptz } from '../../infrastructure/database/columns';
import { specialistProfiles } from '../specialists/specialists.schema';

/**
 * One row = one working interval on one weekday, in the specialist's local time.
 * Non-overlap within a day is an exclusion constraint that Drizzle cannot express;
 * it lives in a custom SQL migration: `weekly_availability_no_overlap`.
 */
export const weeklyAvailability = pgTable(
  'weekly_availability',
  {
    id: idColumn(),
    specialistId: uuid('specialist_id')
      .notNull()
      .references(() => specialistProfiles.userId, { onDelete: 'cascade' }),
    // ISO weekday: 1 = Monday
    weekday: smallint('weekday').notNull(),
    // Minutes from local midnight; int4range over them gives the overlap constraint
    startMinute: smallint('start_minute').notNull(),
    endMinute: smallint('end_minute').notNull(),
  },
  (t) => [
    check('weekly_availability_weekday_range', sql`${t.weekday} between 1 and 7`),
    check('weekly_availability_start_range', sql`${t.startMinute} between 0 and 1439`),
    check(
      'weekly_availability_end_range',
      sql`${t.endMinute} between 1 and 1440 and ${t.endMinute} > ${t.startMinute}`,
    ),
    // No separate index on specialist_id: the GiST index of the exclusion constraint
    // (specialist_id, weekday, range) serves lookups by specialist as well
  ],
);

/** A whole local date of the specialist (not an instant): `date`, not `timestamptz`. */
export const daysOff = pgTable(
  'days_off',
  {
    id: idColumn(),
    specialistId: uuid('specialist_id')
      .notNull()
      .references(() => specialistProfiles.userId, { onDelete: 'cascade' }),
    date: date('date', { mode: 'string' }).notNull(),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
  },
  (t) => [unique('days_off_specialist_date_unique').on(t.specialistId, t.date)],
);

export type WeeklyAvailabilityRow = typeof weeklyAvailability.$inferSelect;
export type DayOffRow = typeof daysOff.$inferSelect;
