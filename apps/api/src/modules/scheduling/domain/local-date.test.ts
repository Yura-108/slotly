import { describe, expect, it } from 'vitest';
import { isPastDate, isValidIsoDate, localDate } from './local-date';

describe('localDate', () => {
  // 21:30 UTC on Dec 31: still the 31st in UTC and New York, already Jan 1st in Moscow (UTC+3)
  const newYearsEve = new Date('2026-12-31T21:30:00Z');

  it.each([
    ['UTC', '2026-12-31'],
    ['Europe/Moscow', '2027-01-01'],
    ['America/New_York', '2026-12-31'],
  ])('in %s it is %s', (zone, date) => {
    expect(localDate(newYearsEve, zone)).toBe(date);
  });

  it('decides "in the past" by the specialist clock', () => {
    expect(isPastDate('2026-12-31', newYearsEve, 'Europe/Moscow')).toBe(true);
    expect(isPastDate('2026-12-31', newYearsEve, 'UTC')).toBe(false);
  });
});

describe('isValidIsoDate', () => {
  it.each(['2026-02-28', '2028-02-29'])('accepts %s', (d) => {
    expect(isValidIsoDate(d)).toBe(true);
  });

  it.each(['2026-02-29', '2026-13-01', '2026-1-01', '01.02.2026', ''])('rejects %j', (d) => {
    expect(isValidIsoDate(d)).toBe(false);
  });
});
