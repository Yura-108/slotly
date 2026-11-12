import {
  type BeforeApplicationShutdown,
  Logger,
  type OnApplicationBootstrap,
} from '@nestjs/common';

/**
 * An in-process background loop (backend.md §4). The next run is scheduled only after the
 * previous one finishes, so runs never overlap. Shutdown waits for the run in flight — it
 * happens in beforeApplicationShutdown, i.e. before the database pool is closed. A failed
 * run is logged and retried on the next tick: one bad minute must not stop the loop.
 *
 * Each module owns its jobs and the tables they touch (ADR-006); this class only runs them.
 * An interval of 0 disables the loop: tests call {@link run} directly with a chosen `now`.
 */
export abstract class PeriodicJob implements OnApplicationBootstrap, BeforeApplicationShutdown {
  private readonly logger = new Logger(this.constructor.name);
  private timer: NodeJS.Timeout | undefined;
  private inFlight: Promise<void> | undefined;
  private stopped = false;

  /** Milliseconds between the end of one run and the start of the next; 0 — disabled. */
  protected abstract readonly intervalMs: number;

  /** One run. Must be safe to repeat and to run on several instances at once. */
  abstract run(now: Date): Promise<void>;

  onApplicationBootstrap(): void {
    if (this.intervalMs > 0) this.scheduleNext();
  }

  async beforeApplicationShutdown(): Promise<void> {
    this.stopped = true;
    clearTimeout(this.timer);
    await this.inFlight;
  }

  private scheduleNext(): void {
    this.timer = setTimeout(() => {
      this.inFlight = this.runSafely().finally(() => {
        this.inFlight = undefined;
        if (!this.stopped) this.scheduleNext();
      });
    }, this.intervalMs);
  }

  private async runSafely(): Promise<void> {
    try {
      await this.run(new Date());
    } catch (error) {
      // e.g. the database is briefly unavailable: log and try again on the next tick
      this.logger.error({ err: error }, 'Background job run failed');
    }
  }
}

/**
 * Repeats a batched delete until a batch comes back short. Small batches keep each
 * statement's locks and WAL short instead of one long DELETE over the whole table.
 */
export async function inBatches(
  batch: (limit: number) => Promise<number>,
  limit = 1000,
): Promise<number> {
  let total = 0;
  for (;;) {
    const n = await batch(limit);
    total += n;
    if (n < limit) return total;
  }
}
