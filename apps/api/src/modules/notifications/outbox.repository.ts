import { Injectable } from '@nestjs/common';
import { and, asc, eq, inArray, lte, sql } from 'drizzle-orm';
import type { Executor, Tx } from '../../infrastructure/database/database.module';
import { SECRET_PAYLOAD_FIELD } from './domain/messages';
import { outboxMessages, type OutboxRow } from './outbox.schema';

const LAST_ERROR_MAX_LENGTH = 1000;

/** Drop the one-time link from the stored payload: it is a secret only needed for delivery. */
const scrubbedPayload = sql`${outboxMessages.payload} - ${SECRET_PAYLOAD_FIELD}::text`;

@Injectable()
export class OutboxRepository {
  async insert(tx: Tx, message: { type: string; payload: Record<string, unknown> }) {
    await tx.insert(outboxMessages).values(message);
  }

  /**
   * Claims due messages with a lease (ADR-012) in one statement: SKIP LOCKED lets concurrent
   * workers take disjoint batches, and moving next_attempt_at forward hides the claimed rows
   * while they are being sent — without holding a transaction open during network I/O.
   * If the process dies mid-send, the lease expires and the message is claimed again.
   */
  async claimDue(
    db: Executor,
    params: { now: Date; leaseUntil: Date; limit: number },
  ): Promise<OutboxRow[]> {
    const due = db
      .select({ id: outboxMessages.id })
      .from(outboxMessages)
      .where(
        and(eq(outboxMessages.status, 'pending'), lte(outboxMessages.nextAttemptAt, params.now)),
      )
      .orderBy(asc(outboxMessages.nextAttemptAt))
      .limit(params.limit)
      .for('update', { skipLocked: true });

    return db
      .update(outboxMessages)
      .set({ nextAttemptAt: params.leaseUntil, attempts: sql`${outboxMessages.attempts} + 1` })
      .where(inArray(outboxMessages.id, due))
      .returning();
  }

  async markSent(db: Executor, id: string, now: Date): Promise<void> {
    await db
      .update(outboxMessages)
      .set({ status: 'sent', processedAt: now, lastError: null, payload: scrubbedPayload })
      .where(eq(outboxMessages.id, id));
  }

  async scheduleRetry(db: Executor, id: string, nextAttemptAt: Date, error: string) {
    await db
      .update(outboxMessages)
      .set({ nextAttemptAt, lastError: error.slice(0, LAST_ERROR_MAX_LENGTH) })
      .where(eq(outboxMessages.id, id));
  }

  async markFailed(db: Executor, id: string, now: Date, error: string): Promise<void> {
    await db
      .update(outboxMessages)
      .set({
        status: 'failed',
        processedAt: now,
        lastError: error.slice(0, LAST_ERROR_MAX_LENGTH),
        payload: scrubbedPayload,
      })
      .where(eq(outboxMessages.id, id));
  }
}
