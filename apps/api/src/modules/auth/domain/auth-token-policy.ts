const HOUR_MS = 60 * 60 * 1000;

/** ADR-005: email confirmation — 24 hours, password reset — 1 hour. */
export const AUTH_TOKEN_TTL_MS = {
  verify_email: 24 * HOUR_MS,
  reset_password: HOUR_MS,
} as const;

export type AuthTokenPurpose = keyof typeof AUTH_TOKEN_TTL_MS;

export function authTokenExpiresAt(purpose: AuthTokenPurpose, now: Date): Date {
  return new Date(now.getTime() + AUTH_TOKEN_TTL_MS[purpose]);
}

/**
 * Links put the token in the URL fragment (ADR-008): the fragment never reaches servers,
 * proxies or Referer headers; the page reads it and POSTs it to the API.
 */
export function authTokenLink(appOrigin: string, purpose: AuthTokenPurpose, token: string) {
  const path = purpose === 'verify_email' ? '/verify-email' : '/reset-password';
  return `${appOrigin}${path}#token=${token}`;
}
