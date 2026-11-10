import { describe, expect, it } from 'vitest';
import { ConfigValidationError, loadConfig } from './config.schema';

const validEnv = {
  DATABASE_URL: 'postgres://u:p@localhost:5433/db',
  APP_ORIGIN: 'http://localhost:3000',
};

describe('loadConfig', () => {
  it('applies defaults and maps env to typed config', () => {
    const config = loadConfig(validEnv);

    expect(config).toEqual({
      port: 4000,
      databaseUrl: validEnv.DATABASE_URL,
      appOrigin: validEnv.APP_ORIGIN,
      session: { cookieName: '__Host-session', cookieSecure: true },
      trustedProxy: 'loopback',
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
