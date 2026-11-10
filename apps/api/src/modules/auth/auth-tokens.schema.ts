import { index, pgEnum, pgTable, uuid } from 'drizzle-orm/pg-core';
import { bytea, idColumn, timestamptz } from '../../infrastructure/database/columns';
import { users } from '../users/users.schema';

export const authTokenPurpose = pgEnum('auth_token_purpose', ['verify_email', 'reset_password']);

/** One-time tokens from emails (ADR-005). Only the SHA-256 of the token is stored. */
export const authTokens = pgTable(
  'auth_tokens',
  {
    id: idColumn(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    purpose: authTokenPurpose('purpose').notNull(),
    tokenHash: bytea('token_hash').notNull().unique('auth_tokens_token_hash_unique'),
    expiresAt: timestamptz('expires_at').notNull(),
    // One-time use: consumed by a conditional UPDATE ... WHERE used_at IS NULL
    usedAt: timestamptz('used_at'),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
  },
  (t) => [index('auth_tokens_user_purpose_idx').on(t.userId, t.purpose)],
);

export type AuthTokenPurpose = (typeof authTokenPurpose.enumValues)[number];
