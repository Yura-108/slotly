import { describe, expect, it } from 'vitest';
import { isDatabaseUnavailable } from './pg-errors';

const withCode = (code: string, message = 'driver error') =>
  Object.assign(new Error(message), { code });

describe('isDatabaseUnavailable', () => {
  it.each([
    ['connection failure (class 08)', '08006'],
    ['server shutting down', '57P01'],
    ['server crashed', '57P02'],
    ['server still starting', '57P03'],
    ['no free connections', '53300'],
    ['statement_timeout', '57014'],
  ])('is true for %s', (_, sqlstate) => {
    expect(isDatabaseUnavailable(withCode(sqlstate))).toBe(true);
  });

  it.each(['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'EHOSTUNREACH', 'ENOTFOUND'])(
    'is true for the socket error %s',
    (code) => {
      expect(isDatabaseUnavailable(withCode(code))).toBe(true);
    },
  );

  it.each([
    'timeout exceeded when trying to connect',
    'Query read timeout',
    'Connection terminated unexpectedly',
    'Connection terminated due to connection timeout',
    'Connection terminated',
  ])('is true for the pg message "%s"', (message) => {
    expect(isDatabaseUnavailable(new Error(message))).toBe(true);
  });

  it('finds the cause under the Drizzle wrapper', () => {
    const wrapped = new Error('Failed query: select 1', { cause: withCode('ECONNREFUSED') });
    expect(isDatabaseUnavailable(wrapped)).toBe(true);
  });

  it('is false for errors of the request itself: they stay 4xx/500, not 503', () => {
    expect(isDatabaseUnavailable(withCode('23505'))).toBe(false); // unique violation
    expect(isDatabaseUnavailable(withCode('42P01'))).toBe(false); // undefined table: our bug
    expect(isDatabaseUnavailable(withCode('57000'))).toBe(false); // same class, other state
    expect(isDatabaseUnavailable(new Error('Connection terminated by the user'))).toBe(false);
    expect(isDatabaseUnavailable(new Error('boom'))).toBe(false);
    expect(isDatabaseUnavailable('ECONNREFUSED')).toBe(false);
    expect(isDatabaseUnavailable(undefined)).toBe(false);
  });
});
