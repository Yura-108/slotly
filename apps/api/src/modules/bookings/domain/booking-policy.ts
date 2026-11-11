/**
 * Rules of creating a booking (requirements §4.1–4.2, FR-50, FR-56). Pure: `now` is a
 * parameter (ADR-006).
 */

const HOUR_MS = 60 * 60 * 1000;

/** How long a specialist has to answer a request (requirements §4.1). */
export const PENDING_ANSWER_HOURS = 24;

/** FR-56: active pending bookings of one client with one specialist. */
export const PENDING_LIMIT = 3;

export type ConfirmationMode = 'auto' | 'manual';

/** FR-50: the specialist's setting decides whether a new booking needs confirmation. */
export function initialStatus(mode: ConfirmationMode): 'pending' | 'confirmed' {
  return mode === 'auto' ? 'confirmed' : 'pending';
}

/**
 * A request expires after 24 hours or when its time comes, whichever is first: an
 * unanswered request for 10:00 must not stay "pending" at 10:30.
 */
export function pendingExpiresAt(now: Date, startAt: Date): Date {
  return new Date(Math.min(now.getTime() + PENDING_ANSWER_HOURS * HOUR_MS, startAt.getTime()));
}
