import { Inject, Injectable, Logger } from '@nestjs/common';
import { AppConfig } from '../../infrastructure/config/config.schema';
import { DATABASE, type Database } from '../../infrastructure/database/database.module';
import { inBatches, PeriodicJob } from '../../infrastructure/jobs/periodic-job';
import { OutboxRepository } from './outbox.repository';

const DAY_MS = 24 * 60 * 60 * 1000;
/** Sent messages are kept a month: enough to answer "did the email go out?". */
export const SENT_RETENTION_DAYS = 30;
/** Failed ones longer: they need investigation (ADR-012). */
export const FAILED_RETENTION_DAYS = 90;

/** Deletes old processed outbox messages (ADR-012); pending ones are never touched. */
@Injectable()
export class OutboxCleanupJob extends PeriodicJob {
  private readonly log = new Logger(OutboxCleanupJob.name);
  protected readonly intervalMs: number;

  constructor(
    config: AppConfig,
    @Inject(DATABASE) private readonly db: Database,
    private readonly outbox: OutboxRepository,
  ) {
    super();
    this.intervalMs = config.jobs.cleanupIntervalMs;
  }

  async run(now: Date): Promise<void> {
    const deleted = await inBatches((limit) =>
      this.outbox.deleteProcessed(this.db, {
        sentBefore: new Date(now.getTime() - SENT_RETENTION_DAYS * DAY_MS),
        failedBefore: new Date(now.getTime() - FAILED_RETENTION_DAYS * DAY_MS),
        limit,
      }),
    );
    if (deleted > 0) this.log.log({ deleted }, 'Deleted old outbox messages');
  }
}
