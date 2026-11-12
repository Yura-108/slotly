import { describe, expect, it } from 'vitest';
import { afterFailedAttempt, LEASE_MS, MAX_ATTEMPTS } from './retry-policy';

const now = new Date('2026-01-01T00:00:00Z');
const minutesLater = (m: number) => new Date(now.getTime() + m * 60_000);

describe('afterFailedAttempt', () => {
  it.each([
    [1, 1],
    [2, 2],
    [3, 4],
    [7, 64],
  ])('after attempt %i waits %i minutes', (attempts, minutes) => {
    expect(afterFailedAttempt(attempts, now)).toEqual({
      status: 'retry',
      nextAttemptAt: minutesLater(minutes),
    });
  });

  it('gives up after the last attempt', () => {
    expect(afterFailedAttempt(MAX_ATTEMPTS, now)).toEqual({ status: 'failed' });
  });
});

describe('LEASE_MS', () => {
  it('outlives one send attempt, so a slow send is not taken by another worker', () => {
    // mail-sender.ts: connection 10 s + greeting 10 s + socket 30 s = 50 s at worst
    expect(LEASE_MS).toBeGreaterThan(50_000);
    expect(LEASE_MS).toBe(5 * 60_000);
  });
});
