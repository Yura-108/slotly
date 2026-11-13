/** PostgreSQL SQLSTATE codes the repositories translate into domain errors. */
export const PgErrorCode = {
  uniqueViolation: '23505',
  checkViolation: '23514',
  exclusionViolation: '23P01',
} as const;

/**
 * Returns the SQLSTATE of a driver error. Drizzle may wrap the `pg` error,
 * so the cause chain is walked.
 */
export function pgErrorCode(error: unknown): string | undefined {
  return findPgError(error)?.code;
}

/** Name of the violated constraint: tells apart several unique constraints of one table. */
export function pgConstraint(error: unknown): string | undefined {
  return findPgError(error)?.constraint;
}

function findPgError(error: unknown): { code: string; constraint?: string } | undefined {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current instanceof Error; depth++) {
    const { code, constraint } = current as { code?: unknown; constraint?: unknown };
    if (typeof code === 'string' && /^[0-9A-Z]{5}$/.test(code)) {
      return { code, constraint: typeof constraint === 'string' ? constraint : undefined };
    }
    current = current.cause;
  }
  return undefined;
}

/**
 * SQLSTATEs that mean "the database cannot serve us right now", not "the request is wrong":
 * the connection is gone (class 08), the server is shutting down or starting (57P0x), it has
 * no free connections (53300), or the statement ran past statement_timeout (57014).
 */
const UNAVAILABLE_SQLSTATE = /^(08...|57P0[1-3]|53300|57014)$/;
/** Socket errors of the driver: the server is unreachable. */
const UNAVAILABLE_SOCKET = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'ENOTFOUND',
  'EAI_AGAIN',
  'EPIPE',
]);
/** `pg` reports its timeouts and lost connections without a code, only with these messages. */
const UNAVAILABLE_MESSAGE =
  /^(timeout exceeded when trying to connect|Query read timeout|Connection terminated( unexpectedly| due to connection timeout)?)$/;

/**
 * True when the error says the database is unreachable or overloaded. The API answers such
 * errors with 503 at once instead of 500 or a hanging request (ADR-016).
 */
export function isDatabaseUnavailable(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current instanceof Error; depth++) {
    const { code } = current as { code?: unknown };
    if (
      typeof code === 'string' &&
      (UNAVAILABLE_SQLSTATE.test(code) || UNAVAILABLE_SOCKET.has(code))
    ) {
      return true;
    }
    if (UNAVAILABLE_MESSAGE.test(current.message)) return true;
    current = current.cause;
  }
  return false;
}
