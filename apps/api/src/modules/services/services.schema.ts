import { sql } from 'drizzle-orm';
import { check, index, integer, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { idColumn, timestampColumns, timestamptz } from '../../infrastructure/database/columns';
import { specialistProfiles } from '../specialists/specialists.schema';

export const services = pgTable(
  'services',
  {
    id: idColumn(),
    specialistId: uuid('specialist_id')
      .notNull()
      .references(() => specialistProfiles.userId),
    name: text('name').notNull(),
    description: text('description'),
    durationMinutes: integer('duration_minutes').notNull(),
    // Archived instead of deleted: existing bookings keep referring to the service (FR-21)
    archivedAt: timestamptz('archived_at'),
    ...timestampColumns(),
  },
  (t) => [
    check('services_name_length', sql`char_length(${t.name}) between 1 and 100`),
    check(
      'services_duration_valid',
      sql`${t.durationMinutes} between 15 and 480 and ${t.durationMinutes} % 5 = 0`,
    ),
    index('services_active_by_specialist_idx')
      .on(t.specialistId)
      .where(sql`${t.archivedAt} is null`),
  ],
);
