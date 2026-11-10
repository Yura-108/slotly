import { sql } from 'drizzle-orm';
import { check, pgTable, text, unique } from 'drizzle-orm/pg-core';
import { idColumn, timestampColumns, timestamptz } from '../../infrastructure/database/columns';

export const users = pgTable(
  'users',
  {
    id: idColumn(),
    email: text('email').notNull(),
    passwordHash: text('password_hash').notNull(),
    name: text('name').notNull(),
    timezone: text('timezone').notNull(),
    emailVerifiedAt: timestamptz('email_verified_at'),
    ...timestampColumns(),
  },
  (t) => [
    unique('users_email_unique').on(t.email),
    // The app normalizes emails; the check stops a differently-cased duplicate bypassing it
    check('users_email_lowercase', sql`${t.email} = lower(${t.email})`),
    check('users_name_length', sql`char_length(${t.name}) between 1 and 100`),
  ],
);

export type UserRow = typeof users.$inferSelect;
export type NewUserRow = typeof users.$inferInsert;
