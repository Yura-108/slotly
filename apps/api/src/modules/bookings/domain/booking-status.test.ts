import { describe, expect, it } from 'vitest';
import {
  allowedActions,
  type BookingState,
  cancelDeadlineAt,
  effectiveStatus,
  refusal,
} from './booking-status';

const at = (iso: string) => new Date(iso);
const START = at('2026-11-20T15:00:00Z');

const booking = (overrides: Partial<BookingState> = {}): BookingState => ({
  status: 'confirmed',
  startAt: START,
  expiresAt: null,
  cancelDeadlineAt: cancelDeadlineAt(START, 24), // 2026-11-19T15:00Z
  ...overrides,
});
const pending = (expiresAt = at('2026-11-19T10:00:00Z')) =>
  booking({ status: 'pending', expiresAt });

describe('effectiveStatus', () => {
  it('treats an overdue request as expired before the job updates the row', () => {
    expect(effectiveStatus(pending(), at('2026-11-19T09:59:59Z'))).toBe('pending');
    expect(effectiveStatus(pending(), at('2026-11-19T10:00:00Z'))).toBe('expired');
    expect(effectiveStatus(booking(), at('2026-11-30T00:00:00Z'))).toBe('confirmed');
  });
});

describe('allowedActions', () => {
  const morning = at('2026-11-18T09:00:00Z');

  it('lets the specialist answer a request and the client withdraw it', () => {
    expect(allowedActions(pending(), 'specialist', morning)).toEqual([
      'confirm',
      'reject',
      'cancel',
    ]);
    expect(allowedActions(pending(), 'client', morning)).toEqual(['cancel']);
  });

  it('lets the client cancel a confirmed booking only before the deadline', () => {
    expect(allowedActions(booking(), 'client', at('2026-11-19T14:59:59Z'))).toEqual(['cancel']);
    expect(allowedActions(booking(), 'client', at('2026-11-19T15:00:00Z'))).toEqual([]);
    // The specialist may cancel at any time before the start
    expect(allowedActions(booking(), 'specialist', at('2026-11-20T14:59:00Z'))).toEqual(['cancel']);
  });

  it('keeps the deadline of booking time, whatever the setting is now', () => {
    // Booked under "24 hours"; the stored moment decides, not a recomputation
    const b = booking({ cancelDeadlineAt: cancelDeadlineAt(START, 24) });
    expect(allowedActions(b, 'client', at('2026-11-19T09:00:00Z'))).toEqual(['cancel']);
  });

  it('allows nothing once the booking has started or the request has expired', () => {
    expect(allowedActions(booking(), 'specialist', START)).toEqual([]);
    expect(allowedActions(pending(), 'specialist', at('2026-11-19T10:00:00Z'))).toEqual([]);
  });

  it('allows nothing in final states', () => {
    for (const status of ['rejected', 'cancelled', 'expired'] as const) {
      expect(allowedActions(booking({ status }), 'specialist', morning)).toEqual([]);
      expect(allowedActions(booking({ status }), 'client', morning)).toEqual([]);
    }
  });
});

describe('refusal', () => {
  const morning = at('2026-11-18T09:00:00Z');

  it('is null exactly when the action is allowed', () => {
    expect(refusal(pending(), 'specialist', 'confirm', morning)).toBeNull();
    expect(refusal(booking(), 'client', 'cancel', morning)).toBeNull();
  });

  it('explains each refusal', () => {
    expect(refusal(pending(), 'client', 'confirm', morning)).toBe('forbidden');
    expect(refusal(booking(), 'client', 'cancel', at('2026-11-19T16:00:00Z'))).toBe(
      'deadline_passed',
    );
    expect(refusal(booking(), 'specialist', 'cancel', START)).toBe('started');
    expect(refusal(booking({ status: 'cancelled' }), 'specialist', 'cancel', morning)).toBe(
      'status_changed',
    );
    // Confirming a request that has just expired: the page was stale
    expect(refusal(pending(), 'specialist', 'confirm', at('2026-11-19T11:00:00Z'))).toBe(
      'status_changed',
    );
    // Confirming an already confirmed booking: someone (another tab) was first
    expect(refusal(booking(), 'specialist', 'confirm', morning)).toBe('status_changed');
  });
});

describe('cancelDeadlineAt', () => {
  it('counts hours back from the start', () => {
    expect(cancelDeadlineAt(START, 24)).toEqual(at('2026-11-19T15:00:00Z'));
    expect(cancelDeadlineAt(START, 0)).toEqual(START);
  });
});
