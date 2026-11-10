const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** Session lifetime rules (ADR-005). Pure: `now` is always a parameter. */
export const SESSION_IDLE_TIMEOUT_MS = 30 * DAY_MS;
export const SESSION_ABSOLUTE_TIMEOUT_MS = 90 * DAY_MS;
/** Writing last_seen_at on every request would turn every read into a write. */
export const SESSION_REFRESH_INTERVAL_MS = HOUR_MS;

export interface SessionTimes {
  createdAt: Date;
  lastSeenAt: Date;
  expiresAt: Date;
}

/** min(last activity + 30 days, start + 90 days) */
export function sessionExpiresAt(createdAt: Date, lastSeenAt: Date): Date {
  return new Date(
    Math.min(
      lastSeenAt.getTime() + SESSION_IDLE_TIMEOUT_MS,
      createdAt.getTime() + SESSION_ABSOLUTE_TIMEOUT_MS,
    ),
  );
}

export function startSession(now: Date): SessionTimes {
  return { createdAt: now, lastSeenAt: now, expiresAt: sessionExpiresAt(now, now) };
}

export type SessionCheck =
  | { status: 'expired' }
  | { status: 'active'; refresh: Pick<SessionTimes, 'lastSeenAt' | 'expiresAt'> | null };

/**
 * Decides whether a stored session is still valid at `now` and whether its
 * sliding expiry should be pushed forward (`refresh`, at most once per interval).
 */
export function checkSession(session: SessionTimes, now: Date): SessionCheck {
  if (now.getTime() >= session.expiresAt.getTime()) return { status: 'expired' };

  const sinceLastSeen = now.getTime() - session.lastSeenAt.getTime();
  if (sinceLastSeen < SESSION_REFRESH_INTERVAL_MS) return { status: 'active', refresh: null };

  return {
    status: 'active',
    refresh: { lastSeenAt: now, expiresAt: sessionExpiresAt(session.createdAt, now) },
  };
}
