import { describe, expect, it } from 'vitest';
import { authTokenExpiresAt, authTokenLink } from './auth-token-policy';

const now = new Date('2026-01-01T00:00:00Z');

describe('auth token policy', () => {
  it('gives email confirmation 24 hours and password reset 1 hour', () => {
    expect(authTokenExpiresAt('verify_email', now)).toEqual(new Date('2026-01-02T00:00:00Z'));
    expect(authTokenExpiresAt('reset_password', now)).toEqual(new Date('2026-01-01T01:00:00Z'));
  });

  it('puts the token into the URL fragment, never the path or query', () => {
    const link = authTokenLink('https://slotly.example', 'reset_password', 'secret');
    expect(link).toBe('https://slotly.example/reset-password#token=secret');
    const url = new URL(link);
    expect(url.search).toBe('');
    expect(url.pathname).not.toContain('secret');
  });
});
