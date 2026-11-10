import { createHash, randomBytes } from 'node:crypto';

/**
 * 256 bits from a CSPRNG for session cookies and one-time email links. Guessing is
 * infeasible, so a fast hash is enough to store it (ADR-005) — unlike passwords.
 */
export function generateSecretToken(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * What the database stores and looks up. A leaked table therefore does not let anyone
 * sign in or use a link: the token cannot be derived from its hash.
 */
export function hashSecretToken(token: string): Buffer {
  return createHash('sha256').update(token, 'utf8').digest();
}
