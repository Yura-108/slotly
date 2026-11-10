import { Injectable } from '@nestjs/common';
import type { Tx } from '../../infrastructure/database/database.module';
import { type OutboxMessage, outboxMessageSchema } from './domain/messages';
import { OutboxRepository } from './outbox.repository';

export type { OutboxMessage } from './domain/messages';

/** Public API of the notifications module (ADR-006, ADR-012). */
@Injectable()
export class NotificationsService {
  constructor(private readonly outbox: OutboxRepository) {}

  /**
   * Records the intent to send an email in the caller's transaction: it is sent if and
   * only if the change commits. The payload is validated now, so a bug fails the request
   * that caused it, not a background job hours later.
   */
  async enqueue(tx: Tx, message: OutboxMessage): Promise<void> {
    const valid = outboxMessageSchema.parse(message);
    await this.outbox.insert(tx, { type: valid.type, payload: valid.payload });
  }
}
