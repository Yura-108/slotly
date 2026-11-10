import { index, pgTable, text, unique, uuid } from 'drizzle-orm/pg-core';
import { bytea, idColumn, timestamptz } from '../../infrastructure/database/columns';
import { users } from '../users/users.schema';

/** Server-side sessions (ADR-005). The cookie token itself is never stored, only its SHA-256. */
export const sessions = pgTable(
  'sessions',
  {
    id: idColumn(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: bytea('token_hash').notNull(),
    // Start of the absolute lifetime (90 days)
    createdAt: timestamptz('created_at').notNull(),
    // Sliding lifetime (30 days); refreshed at most once an hour
    lastSeenAt: timestamptz('last_seen_at').notNull(),
    expiresAt: timestamptz('expires_at').notNull(),
    userAgent: text('user_agent'),
  },
  (t) => [
    unique('sessions_token_hash_unique').on(t.tokenHash),
    // Revoke all sessions of a user on password change
    index('sessions_user_id_idx').on(t.userId),
    // Cleanup of expired sessions
    index('sessions_expires_at_idx').on(t.expiresAt),
  ],
);

export type SessionRow = typeof sessions.$inferSelect;
export type NewSessionRow = typeof sessions.$inferInsert;
