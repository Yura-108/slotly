import { describe, expect, it } from 'vitest';
import { dateKey, groupByDay, rangeOf, weekDays } from './slot-grid';

describe('weekDays and rangeOf', () => {
  it('gives seven consecutive local days and the range that covers them exactly', () => {
    const now = new Date(2026, 10, 11, 15, 30); // 11 November, afternoon, runtime zone
    const days = weekDays(now, 1);
    expect(days).toHaveLength(7);
    expect(days.map((d) => d.getDate())).toEqual([18, 19, 20, 21, 22, 23, 24]);
    expect(days.every((d) => d.getHours() === 0 && d.getMinutes() === 0)).toBe(true);

    const { from, to } = rangeOf(days);
    expect(new Date(from)).toEqual(new Date(2026, 10, 18));
    expect(new Date(to)).toEqual(new Date(2026, 10, 25));
  });

  it('crosses month and year ends', () => {
    const days = weekDays(new Date(2026, 11, 29), 0);
    expect(days.map((d) => `${d.getMonth() + 1}/${d.getDate()}`)).toEqual([
      '12/29',
      '12/30',
      '12/31',
      '1/1',
      '1/2',
      '1/3',
      '1/4',
    ]);
  });
});

describe('groupByDay', () => {
  const slots = [
    { start: '2026-11-16T20:00:00.000Z', end: '2026-11-16T21:00:00.000Z' },
    { start: '2026-11-16T22:00:00.000Z', end: '2026-11-16T23:00:00.000Z' },
  ];

  it("groups by the viewer's date, which differs between zones", () => {
    // 22:00 UTC is already the 17th in Moscow but still the 16th in New York
    expect([...groupByDay(slots, 'Europe/Moscow').keys()]).toEqual(['2026-11-16', '2026-11-17']);
    expect([...groupByDay(slots, 'America/New_York').keys()]).toEqual(['2026-11-16']);
    expect(groupByDay(slots, 'America/New_York').get('2026-11-16')).toHaveLength(2);
  });

  it('formats date keys as YYYY-MM-DD', () => {
    expect(dateKey(new Date('2026-01-05T12:00:00Z'), 'UTC')).toBe('2026-01-05');
  });
});
