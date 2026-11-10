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
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current instanceof Error; depth++) {
    const code = (current as { code?: unknown }).code;
    if (typeof code === 'string' && /^[0-9A-Z]{5}$/.test(code)) return code;
    current = current.cause;
  }
  return undefined;
}
