import { describe, expect, it } from 'vitest';
import { contentSecurityPolicy, newNonce, staticSecurityHeaders } from './security-headers';

const directive = (csp: string, name: string) =>
  csp
    .split('; ')
    .find((d) => d.startsWith(`${name} `))
    ?.split(' ')
    .slice(1);

describe('contentSecurityPolicy', () => {
  it('allows scripts only with the nonce of this response, never inline or eval in production', () => {
    const csp = contentSecurityPolicy('abc123', { dev: false });
    expect(directive(csp, 'script-src')).toEqual(["'self'", "'nonce-abc123'", "'strict-dynamic'"]);
    expect(directive(csp, 'style-src')).toEqual(["'self'", "'nonce-abc123'"]);
    expect(csp).not.toContain('unsafe-inline');
    expect(csp).not.toContain('unsafe-eval');
  });

  it('relaxes only development: eval for React error stacks, inline styles of the dev overlay', () => {
    const csp = contentSecurityPolicy('abc123', { dev: true });
    expect(directive(csp, 'script-src')).toEqual([
      "'self'",
      "'nonce-abc123'",
      "'strict-dynamic'",
      "'unsafe-eval'",
    ]);
    expect(directive(csp, 'style-src')).toEqual(["'self'", "'unsafe-inline'"]);
  });

  it('forbids framing, plugins and foreign <base> or form targets', () => {
    const csp = contentSecurityPolicy('n', { dev: false });
    expect(directive(csp, 'frame-ancestors')).toEqual(["'none'"]);
    expect(directive(csp, 'object-src')).toEqual(["'none'"]);
    expect(directive(csp, 'base-uri')).toEqual(["'self'"]);
    expect(directive(csp, 'form-action')).toEqual(["'self'"]);
    expect(directive(csp, 'default-src')).toEqual(["'self'"]);
  });
});

describe('newNonce', () => {
  it('is new for every response and fits the CSP nonce syntax', () => {
    const nonces = new Set(Array.from({ length: 100 }, newNonce));
    expect(nonces.size).toBe(100);
    for (const nonce of nonces) expect(nonce).toMatch(/^[A-Za-z0-9+/]+={0,2}$/);
  });
});

describe('staticSecurityHeaders', () => {
  const keys = (production: boolean) => staticSecurityHeaders({ production }).map((h) => h.key);

  it('sends HSTS in production only', () => {
    expect(keys(true)).toContain('Strict-Transport-Security');
    expect(keys(false)).not.toContain('Strict-Transport-Security');
  });

  it('always forbids MIME sniffing and limits the referrer', () => {
    for (const production of [true, false]) {
      expect(keys(production)).toEqual(
        expect.arrayContaining(['X-Content-Type-Options', 'Referrer-Policy', 'Permissions-Policy']),
      );
    }
  });
});
