import { createHash, randomBytes } from 'node:crypto';

/** 256 bits from a CSPRNG: guessing is infeasible, so a fast hash is enough to store it (ADR-005). */
export function generateSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * What the database stores and looks up. A leaked `sessions` table therefore
 * does not let anyone sign in: the cookie value cannot be derived from the hash.
 */
export function hashSessionToken(token: string): Buffer {
  return createHash('sha256').update(token, 'utf8').digest();
}
