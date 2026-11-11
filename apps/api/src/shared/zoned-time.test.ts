import { describe, expect, it } from 'vitest';
import { addDays, isoWeekday, resolveLocalTime, toLocalDateTime } from './zoned-time';

const iso = (dates: Date[]) => dates.map((d) => d.toISOString());
const at = (h: number, m = 0) => h * 60 + m;

// Transition dates checked against the runtime's tz database (2026)
describe('resolveLocalTime', () => {
  it('gives one instant for an ordinary reading', () => {
    expect(iso(resolveLocalTime('2026-07-01', at(10), 'Europe/Berlin'))).toEqual([
      '2026-07-01T08:00:00.000Z',
    ]);
    expect(iso(resolveLocalTime('2026-01-15', at(10), 'Europe/Berlin'))).toEqual([
      '2026-01-15T09:00:00.000Z',
    ]);
    expect(iso(resolveLocalTime('2026-03-29', at(10), 'Europe/Moscow'))).toEqual([
      '2026-03-29T07:00:00.000Z',
    ]);
  });

  it('gives no instant for a reading skipped by spring forward', () => {
    // Berlin 2026-03-29: 01:59 CET is followed by 03:00 CEST
    expect(resolveLocalTime('2026-03-29', at(2), 'Europe/Berlin')).toEqual([]);
    expect(resolveLocalTime('2026-03-29', at(2, 59), 'Europe/Berlin')).toEqual([]);
    expect(iso(resolveLocalTime('2026-03-29', at(1, 59), 'Europe/Berlin'))).toEqual([
      '2026-03-29T00:59:00.000Z',
    ]);
    expect(iso(resolveLocalTime('2026-03-29', at(3), 'Europe/Berlin'))).toEqual([
      '2026-03-29T01:00:00.000Z',
    ]);
  });

  it('gives both instants, earliest first, for a reading repeated by fall back', () => {
    // Berlin 2026-10-25: 02:00–02:59 happens in CEST and again in CET
    expect(iso(resolveLocalTime('2026-10-25', at(2, 30), 'Europe/Berlin'))).toEqual([
      '2026-10-25T00:30:00.000Z',
      '2026-10-25T01:30:00.000Z',
    ]);
    // New York 2026-11-01: 01:00–01:59 repeats
    expect(iso(resolveLocalTime('2026-11-01', at(1), 'America/New_York'))).toEqual([
      '2026-11-01T05:00:00.000Z',
      '2026-11-01T06:00:00.000Z',
    ]);
  });

  it('handles transitions at midnight', () => {
    // Santiago 2026-09-06: the day starts at 01:00, midnight does not exist
    expect(resolveLocalTime('2026-09-06', 0, 'America/Santiago')).toEqual([]);
    expect(iso(resolveLocalTime('2026-09-06', at(1), 'America/Santiago'))).toEqual([
      '2026-09-06T04:00:00.000Z',
    ]);
    // Havana 2026-11-01: midnight happens twice
    expect(iso(resolveLocalTime('2026-11-01', 0, 'America/Havana'))).toEqual([
      '2026-11-01T04:00:00.000Z',
      '2026-11-01T05:00:00.000Z',
    ]);
  });

  it('handles a half-hour transition', () => {
    // Lord Howe 2026-10-04: 02:00–02:29 skipped (+10:30 → +11:00)
    expect(resolveLocalTime('2026-10-04', at(2, 15), 'Australia/Lord_Howe')).toEqual([]);
    expect(iso(resolveLocalTime('2026-10-04', at(2, 30), 'Australia/Lord_Howe'))).toEqual([
      '2026-10-03T15:30:00.000Z',
    ]);
  });

  it('round-trips through toLocalDateTime', () => {
    for (const [date, minute, zone] of [
      ['2026-12-31', at(23, 45), 'Asia/Vladivostok'],
      ['2026-02-28', at(0, 5), 'America/Los_Angeles'],
      ['2026-06-15', at(12), 'UTC'],
    ] as const) {
      const [instant] = resolveLocalTime(date, minute, zone);
      expect(instant && toLocalDateTime(instant, zone)).toEqual({ date, minute });
    }
  });
});

describe('toLocalDateTime', () => {
  it('reads the clock of the zone, including the date', () => {
    const instant = new Date('2026-12-31T22:30:00Z');
    expect(toLocalDateTime(instant, 'Europe/Moscow')).toEqual({ date: '2027-01-01', minute: 90 });
    expect(toLocalDateTime(instant, 'America/New_York')).toEqual({
      date: '2026-12-31',
      minute: at(17, 30),
    });
  });

  it('shows the same reading twice across fall back', () => {
    const first = toLocalDateTime(new Date('2026-10-25T00:30:00Z'), 'Europe/Berlin');
    const second = toLocalDateTime(new Date('2026-10-25T01:30:00Z'), 'Europe/Berlin');
    expect(first).toEqual(second);
  });
});

describe('calendar helpers', () => {
  it('adds days across month and year ends', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('gives ISO weekdays', () => {
    expect(isoWeekday('2026-11-09')).toBe(1); // Monday
    expect(isoWeekday('2026-11-15')).toBe(7); // Sunday
  });
});
