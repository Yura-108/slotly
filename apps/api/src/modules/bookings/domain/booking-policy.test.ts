import { describe, expect, it } from 'vitest';
import { initialStatus, pendingExpiresAt } from './booking-policy';

describe('booking policy', () => {
  const now = new Date('2026-11-16T10:00:00Z');

  it('gives the specialist 24 hours to answer a request for a later time', () => {
    expect(pendingExpiresAt(now, new Date('2026-11-20T10:00:00Z'))).toEqual(
      new Date('2026-11-17T10:00:00Z'),
    );
  });

  it('expires a request no later than its own start', () => {
    const startAt = new Date('2026-11-16T15:00:00Z');
    expect(pendingExpiresAt(now, startAt)).toEqual(startAt);
  });

  it('confirms immediately only in automatic mode', () => {
    expect(initialStatus('auto')).toBe('confirmed');
    expect(initialStatus('manual')).toBe('pending');
  });
});
