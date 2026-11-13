import { describe, expect, it } from 'vitest';
import { ConfigValidationError, loadConfig } from './config.schema';

const validEnv = {
  DATABASE_URL: 'postgres://u:p@localhost:5433/db',
  APP_ORIGIN: 'http://localhost:3000',
  SMTP_URL: 'smtp://localhost:1025',
  EMAIL_FROM: 'Slotly <no-reply@slotly.test>',
};

describe('loadConfig', () => {
  it('applies defaults and maps env to typed config', () => {
    const config = loadConfig(validEnv);

    expect(config).toEqual({
      port: 4000,
      host: '127.0.0.1',
      databaseUrl: validEnv.DATABASE_URL,
      database: { connectTimeoutMs: 2000, statementTimeoutMs: 5000 },
      appOrigin: validEnv.APP_ORIGIN,
      session: { cookieName: '__Host-session', cookieSecure: true },
      trustedProxy: 'loopback',
      email: { smtpUrl: validEnv.SMTP_URL, from: validEnv.EMAIL_FROM },
      outbox: { pollIntervalMs: 5000 },
      jobs: { bookingExpiryIntervalMs: 60_000, cleanupIntervalMs: 3_600_000 },
      log: { level: 'info', format: 'json' },
    });
  });

  it('normalizes APP_ORIGIN to a bare origin', () => {
    expect(loadConfig({ ...validEnv, APP_ORIGIN: 'https://slotly.example/' }).appOrigin).toBe(
      'https://slotly.example',
    );
  });

  it('parses COOKIE_SECURE as a boolean', () => {
    const config = loadConfig({
      ...validEnv,
      SESSION_COOKIE_NAME: 'session',
      COOKIE_SECURE: 'false',
    });
    expect(config.session).toEqual({ cookieName: 'session', cookieSecure: false });
  });

  it('refuses a __Host- cookie without Secure', () => {
    expect(() => loadConfig({ ...validEnv, COOKIE_SECURE: 'false' })).toThrow(/__Host-/);
  });

  it('coerces PORT from string', () => {
    expect(loadConfig({ ...validEnv, PORT: '8080' }).port).toBe(8080);
  });

  it('accepts an IP address as HOST, not a host name', () => {
    expect(loadConfig({ ...validEnv, HOST: '0.0.0.0' }).host).toBe('0.0.0.0');
    expect(loadConfig({ ...validEnv, HOST: '::1' }).host).toBe('::1');
    // "localhost" may resolve to ::1 or 127.0.0.1: the bound interface must be explicit
    expect(() => loadConfig({ ...validEnv, HOST: 'localhost' })).toThrow(ConfigValidationError);
  });

  it('reports every invalid variable at once', () => {
    const load = () => loadConfig({ APP_ORIGIN: 'not-a-url', LOG_FORMAT: 'xml' });

    expect(load).toThrow(ConfigValidationError);
    expect(load).toThrow(/DATABASE_URL/);
    expect(load).toThrow(/APP_ORIGIN/);
    expect(load).toThrow(/LOG_FORMAT/);
  });

  it('rejects a non-PostgreSQL database URL', () => {
    expect(() => loadConfig({ ...validEnv, DATABASE_URL: 'mysql://u:p@localhost/db' })).toThrow(
      /DATABASE_URL/,
    );
  });
});
