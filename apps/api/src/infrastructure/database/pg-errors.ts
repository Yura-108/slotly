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
