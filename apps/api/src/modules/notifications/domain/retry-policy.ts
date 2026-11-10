const MINUTE_MS = 60_000;

/** ADR-012: 1, 2, 4, … minutes between attempts; after the 8th failure the message is `failed`. */
export const MAX_ATTEMPTS = 8;

/** How long a claimed message is hidden from other workers while it is being sent. */
export const LEASE_MS = 5 * MINUTE_MS;

export type AttemptOutcome = { status: 'retry'; nextAttemptAt: Date } | { status: 'failed' };

/** `attempts` already counts the attempt that has just failed. */
export function afterFailedAttempt(attempts: number, now: Date): AttemptOutcome {
  if (attempts >= MAX_ATTEMPTS) return { status: 'failed' };
  const delay = 2 ** (attempts - 1) * MINUTE_MS;
  return { status: 'retry', nextAttemptAt: new Date(now.getTime() + delay) };
}
