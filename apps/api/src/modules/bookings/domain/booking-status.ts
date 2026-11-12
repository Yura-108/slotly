/**
 * The booking state machine (requirements §4.1) — the one place that knows who may do what
 * with a booking and when. Its answer is both shown to the user (`allowedActions`, ADR-009)
 * and enforced by the use case, so the button and the rule cannot disagree. Pure: `now` is
 * a parameter (ADR-006).
 */

export type BookingStatus = 'pending' | 'confirmed' | 'rejected' | 'cancelled' | 'expired';
export type BookingAction = 'confirm' | 'reject' | 'cancel';
/** Who looks at the booking: its client or its specialist. */
export type Party = 'client' | 'specialist';

export interface BookingState {
  status: BookingStatus;
  startAt: Date;
  /** Pending only. */
  expiresAt: Date | null;
  /** Snapshot of the client cancellation rule at booking time. */
  cancelDeadlineAt: Date;
}

/**
 * An overdue pending booking is expired everywhere at once (ADR-003), even before the
 * background job updates the row.
 */
export function effectiveStatus(booking: BookingState, now: Date): BookingStatus {
  // Stryker disable next-line ConditionalExpression,LogicalOperator: only pending has expires_at (CHECK bookings_expires_only_pending); the status test states the rule
  if (booking.status === 'pending' && booking.expiresAt && booking.expiresAt <= now) {
    return 'expired';
  }
  return booking.status;
}

/**
 * Actions available to `party` now. Nothing changes once the booking has started:
 * marking "attended" or "no-show" is a later feature (FR-57).
 */
export function allowedActions(booking: BookingState, party: Party, now: Date): BookingAction[] {
  if (now >= booking.startAt) return [];
  switch (effectiveStatus(booking, now)) {
    case 'pending':
      // A request can be withdrawn at any time: it has not been agreed yet
      return party === 'specialist' ? ['confirm', 'reject', 'cancel'] : ['cancel'];
    case 'confirmed':
      if (party === 'specialist') return ['cancel'];
      return now < booking.cancelDeadlineAt ? ['cancel'] : [];
    default:
      return [];
  }
}

export type Refusal = 'forbidden' | 'started' | 'deadline_passed' | 'status_changed';

/**
 * Why an action is not allowed, for an error the user can act on; null when it is allowed.
 * Consistent with {@link allowedActions} by construction: it is consulted first.
 */
export function refusal(
  booking: BookingState,
  party: Party,
  action: BookingAction,
  now: Date,
): Refusal | null {
  if (allowedActions(booking, party, now).includes(action)) return null;
  // A client can never confirm or reject, whatever the state
  if (party === 'client' && action !== 'cancel') return 'forbidden';
  if (now >= booking.startAt) return 'started';
  const status = effectiveStatus(booking, now);
  // Stryker disable next-line ConditionalExpression,LogicalOperator: a client's other actions returned "forbidden" above, a specialist's cancel is always allowed before the start
  if (party === 'client' && action === 'cancel' && status === 'confirmed') {
    return 'deadline_passed';
  }
  // The page showed an older state: confirmed, cancelled or expired meanwhile
  return 'status_changed';
}

const HOUR_MS = 60 * 60 * 1000;

/** The client may cancel a confirmed booking until this moment (FR-11, FR-53). */
export function cancelDeadlineAt(startAt: Date, clientCancelDeadlineHours: number): Date {
  return new Date(startAt.getTime() - clientCancelDeadlineHours * HOUR_MS);
}
