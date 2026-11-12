import { Injectable } from '@nestjs/common';
import { AppConfig } from '../../infrastructure/config/config.schema';
import { PeriodicJob } from '../../infrastructure/jobs/periodic-job';
import { OutboxProcessor } from './outbox.processor';

/** Sends due outbox messages (ADR-012). */
@Injectable()
export class OutboxWorker extends PeriodicJob {
  protected readonly intervalMs: number;

  constructor(
    config: AppConfig,
    private readonly processor: OutboxProcessor,
  ) {
    super();
    this.intervalMs = config.outbox.pollIntervalMs;
  }

  async run(now: Date): Promise<void> {
    await this.processor.processDue(now);
  }
}
