import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { inBatches, PeriodicJob } from './periodic-job';

class ProbeJob extends PeriodicJob {
  runs = 0;
  active = 0;
  maxActive = 0;
  constructor(
    protected readonly intervalMs: number,
    private readonly body: (n: number) => Promise<void> = () => Promise.resolve(),
  ) {
    super();
  }
  async run(): Promise<void> {
    this.runs++;
    this.active++;
    this.maxActive = Math.max(this.maxActive, this.active);
    try {
      await this.body(this.runs);
    } finally {
      this.active--;
    }
  }
}

const slow = (ms: number) => () => new Promise<void>((resolve) => setTimeout(resolve, ms));

describe('PeriodicJob', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('never overlaps runs, even when a run is slower than the interval', async () => {
    const job = new ProbeJob(10, slow(50));
    job.onApplicationBootstrap();
    await vi.advanceTimersByTimeAsync(500);
    // Shutdown waits for the run in flight, whose timer needs the fake clock to move
    const stopping = job.beforeApplicationShutdown();
    await vi.advanceTimersByTimeAsync(100);
    await stopping;
    expect(job.runs).toBeGreaterThan(3);
    expect(job.maxActive).toBe(1);
  });

  it('keeps running after a failed run', async () => {
    const job = new ProbeJob(10, (n) =>
      n === 1 ? Promise.reject(new Error('db down')) : Promise.resolve(),
    );
    job.onApplicationBootstrap();
    await vi.advanceTimersByTimeAsync(35);
    await job.beforeApplicationShutdown();
    expect(job.runs).toBeGreaterThanOrEqual(3);
  });

  it('waits for the run in flight on shutdown and schedules no more', async () => {
    let finished = false;
    const job = new ProbeJob(10, async () => {
      await slow(100)();
      finished = true;
    });
    job.onApplicationBootstrap();
    await vi.advanceTimersByTimeAsync(15); // the first run has started
    const stopping = job.beforeApplicationShutdown();
    await vi.advanceTimersByTimeAsync(200);
    await stopping;
    expect(finished).toBe(true);
    const runs = job.runs;
    await vi.advanceTimersByTimeAsync(500);
    expect(job.runs).toBe(runs);
  });

  it('does not start when the interval is 0', async () => {
    const job = new ProbeJob(0);
    job.onApplicationBootstrap();
    await vi.advanceTimersByTimeAsync(1000);
    expect(job.runs).toBe(0);
  });
});

describe('inBatches', () => {
  it('repeats until a batch comes back short', async () => {
    const left = [3, 3, 1];
    const calls: number[] = [];
    const total = await inBatches((limit) => {
      calls.push(limit);
      return Promise.resolve(left.shift() ?? 0);
    }, 3);
    expect(total).toBe(7);
    expect(calls).toEqual([3, 3, 3]);
  });
});
