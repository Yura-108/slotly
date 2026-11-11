/**
 * Where to go after sign-in. Only same-site paths are accepted: `?next=https://evil.example`
 * or `?next=//evil.example` would otherwise turn our login page into an open redirect
 * that phishing links can borrow trust from.
 */
export function safeRedirectPath(next: string | null | undefined, fallback = '/start'): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) {
    return fallback;
  }
  return next;
}
