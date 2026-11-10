import { Inject, Injectable, Logger } from '@nestjs/common';
import { DATABASE, type Database } from '../../infrastructure/database/database.module';
import { outboxMessageSchema } from './domain/messages';
import { afterFailedAttempt, LEASE_MS } from './domain/retry-policy';
import { renderEmail } from './domain/templates';
import { MailSender } from './mail-sender';
import { OutboxRepository } from './outbox.repository';
import type { OutboxRow } from './outbox.schema';

const BATCH_SIZE = 10;

export interface BatchResult {
  sent: number;
  retried: number;
  failed: number;
}

/** Only error codes go to logs: SMTP messages can contain the recipient's address. */
function errorCode(error: unknown): string {
  const { code, responseCode } = (error ?? {}) as { code?: unknown; responseCode?: unknown };
  const parts = [code, responseCode].filter(
    (v): v is string | number => typeof v === 'string' || typeof v === 'number',
  );
  return parts.join('/') || 'UNKNOWN';
}

function errorText(error: unknown): string {
  return error instanceof Error ? `${errorCode(error)}: ${error.message}` : String(error);
}

/** Delivers one batch of due outbox messages (ADR-012). Called by the worker loop and by tests. */
@Injectable()
export class OutboxProcessor {
  private readonly logger = new Logger(OutboxProcessor.name);

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly outbox: OutboxRepository,
    private readonly mail: MailSender,
  ) {}

  async processDue(now = new Date()): Promise<BatchResult> {
    const claimed = await this.outbox.claimDue(this.db, {
      now,
      leaseUntil: new Date(now.getTime() + LEASE_MS),
      limit: BATCH_SIZE,
    });
    const result: BatchResult = { sent: 0, retried: 0, failed: 0 };
    for (const row of claimed) {
      result[await this.deliver(row)]++;
    }
    return result;
  }

  private async deliver(row: OutboxRow): Promise<keyof BatchResult> {
    const context = { outboxMessageId: row.id, type: row.type, attempt: row.attempts };

    const parsed = outboxMessageSchema.safeParse({ type: row.type, payload: row.payload });
    if (!parsed.success) {
      // Retrying cannot fix a payload this release does not understand
      await this.outbox.markFailed(this.db, row.id, new Date(), 'Invalid payload for its type');
      this.logger.error(context, 'Outbox message has an invalid payload');
      return 'failed';
    }

    try {
      const email = renderEmail(parsed.data);
      await this.mail.send({
        to: parsed.data.payload.to,
        messageId: `<${row.id}@slotly>`,
        ...email,
      });
    } catch (error) {
      const outcome = afterFailedAttempt(row.attempts, new Date());
      if (outcome.status === 'failed') {
        await this.outbox.markFailed(this.db, row.id, new Date(), errorText(error));
        this.logger.error({ ...context, errorCode: errorCode(error) }, 'Email delivery failed');
        return 'failed';
      }
      await this.outbox.scheduleRetry(this.db, row.id, outcome.nextAttemptAt, errorText(error));
      this.logger.warn(
        { ...context, errorCode: errorCode(error) },
        'Email delivery will be retried',
      );
      return 'retried';
    }

    await this.outbox.markSent(this.db, row.id, new Date());
    this.logger.log(context, 'Email sent');
    return 'sent';
  }
}
