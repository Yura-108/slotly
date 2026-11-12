/**
 * Security headers of the web app (security.md, ADR-014). Framework-free, so the policy
 * is unit-tested; proxy.ts and next.config.ts only apply it.
 */

/** A fresh, unguessable value per response: a reusable nonce is as weak as 'unsafe-inline'. */
export function newNonce(): string {
  return btoa(crypto.randomUUID());
}

/**
 * Content-Security-Policy with a per-request nonce. Next.js reads the nonce from this
 * header while rendering and puts it on its own scripts and styles; 'strict-dynamic' lets
 * those scripts load further chunks. Anything injected into the page without the nonce —
 * an inline <script>, an onerror="…" attribute, a script from another host — is blocked.
 */
export function contentSecurityPolicy(nonce: string, options: { dev: boolean }): string {
  const directives = [
    "default-src 'self'",
    // React uses eval only in development, to rebuild server error stacks in the browser
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${options.dev ? " 'unsafe-eval'" : ''}`,
    // The Next.js dev overlay injects styles without the nonce. With a nonce present the
    // browser ignores 'unsafe-inline', so development uses 'unsafe-inline' alone
    options.dev ? "style-src 'self' 'unsafe-inline'" : `style-src 'self' 'nonce-${nonce}'`,
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    // An injected <base> would redirect every relative script and link
    "base-uri 'self'",
    "form-action 'self'",
    // Clickjacking: no site may put our pages in a frame
    "frame-ancestors 'none'",
  ];
  return directives.join('; ');
}

const ONE_YEAR_S = 365 * 24 * 60 * 60;

/** Headers that do not change per request, applied to every response by next.config.ts. */
export function staticSecurityHeaders(options: { production: boolean }) {
  return [
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
    // Browsers ignore HSTS over plain HTTP; outside production it would only pin
    // localhost to HTTPS for a year
    ...(options.production
      ? [{ key: 'Strict-Transport-Security', value: `max-age=${ONE_YEAR_S}; includeSubDomains` }]
      : []),
  ];
}
