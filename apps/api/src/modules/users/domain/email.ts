/**
 * Canonical form of an email for storage and lookup (data-model.md: users.email).
 * The database CHECK (email = lower(email)) backs this up for any other write path.
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
