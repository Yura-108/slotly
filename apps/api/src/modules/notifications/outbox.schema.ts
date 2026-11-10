import { sql } from 'drizzle-orm';
import { check, index, integer, jsonb, pgEnum, pgTable, text } from 'drizzle-orm/pg-core';
import { idColumn, timestamptz } from '../../infrastructure/database/columns';

export const outboxStatus = pgEnum('outbox_status', ['pending', 'sent', 'failed']);

/**
 * Transactional outbox (ADR-012): written in the same transaction as the change
 * it reports, delivered later by the worker with retries.
 */
export const outboxMessages = pgTable(
  'outbox_messages',
  {
    id: idColumn(),
    type: text('type').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    status: outboxStatus('status').notNull().default('pending'),
    attempts: integer('attempts').notNull().default(0),
    // Also the lease: a claimed message is pushed into the future while it is being sent
    nextAttemptAt: timestamptz('next_attempt_at').notNull().defaultNow(),
    lastError: text('last_error'),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
    processedAt: timestamptz('processed_at'),
  },
  (t) => [
    check('outbox_messages_attempts_non_negative', sql`${t.attempts} >= 0`),
    index('outbox_messages_due_idx')
      .on(t.nextAttemptAt)
      .where(sql`${t.status} = 'pending'`),
  ],
);

export type OutboxRow = typeof outboxMessages.$inferSelect;
