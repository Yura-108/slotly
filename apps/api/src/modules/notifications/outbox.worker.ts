import {
  type BeforeApplicationShutdown,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
} from '@nestjs/common';
import { AppConfig } from '../../infrastructure/config/config.schema';
import { OutboxProcessor } from './outbox.processor';

/**
 * In-process polling loop (ADR-012). The next run is scheduled only after the previous one
 * finishes, so runs never overlap. Shutdown waits for the batch in flight — it runs in
 * beforeApplicationShutdown, i.e. before the database pool is closed.
 */
@Injectable()
export class OutboxWorker implements OnApplicationBootstrap, BeforeApplicationShutdown {
  private readonly logger = new Logger(OutboxWorker.name);
  private timer: NodeJS.Timeout | undefined;
  private inFlight: Promise<void> | undefined;
  private stopped = false;

  constructor(
    private readonly config: AppConfig,
    private readonly processor: OutboxProcessor,
  ) {}

  onApplicationBootstrap(): void {
    if (this.config.outbox.pollIntervalMs > 0) this.scheduleNext();
  }

  async beforeApplicationShutdown(): Promise<void> {
    this.stopped = true;
    clearTimeout(this.timer);
    await this.inFlight;
  }

  private scheduleNext(): void {
    this.timer = setTimeout(() => {
      this.inFlight = this.runOnce().finally(() => {
        this.inFlight = undefined;
        if (!this.stopped) this.scheduleNext();
      });
    }, this.config.outbox.pollIntervalMs);
  }

  private async runOnce(): Promise<void> {
    try {
      await this.processor.processDue();
    } catch (error) {
      // e.g. the database is briefly unavailable: log and try again on the next tick
      this.logger.error({ err: error }, 'Outbox batch failed');
    }
  }
}
