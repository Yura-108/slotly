const MINUTE = 60_000;

/** Baseline for every route, per client IP (ADR-005: in-memory, single instance). */
export const DEFAULT_RATE_LIMIT = { name: 'default', ttl: MINUTE, limit: 120 };

/** For endpoints that check secrets or create accounts: slows down guessing and spam. */
export const AUTH_RATE_LIMIT = { default: { ttl: MINUTE, limit: 10 } };
