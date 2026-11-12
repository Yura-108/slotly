import { describe, expect, it } from 'vitest';
import {
  findOverlaps,
  formatTime,
  parseTime,
  sortIntervals,
  type WeeklyInterval,
} from './weekly-schedule';

const at = (weekday: WeeklyInterval['weekday'], start: string, end: string): WeeklyInterval => ({
  weekday,
  startMinute: parseTime(start) ?? -1,
  endMinute: parseTime(end) ?? -1,
});

describe('time of day', () => {
  it.each([
    ['00:00', 0],
    ['10:30', 630],
    ['23:59', 1439],
    ['24:00', 1440],
  ])('parses %s', (text, minutes) => {
    expect(parseTime(text)).toBe(minutes);
    expect(formatTime(minutes)).toBe(text);
  });

  // Extra characters around a valid time must not be ignored ("110:30" is not 10:30)
  it.each(['24:01', '25:00', '9:00', '10:60', '10.30', '', '110:30', '10:300', ' 10:30'])(
    'rejects %j',
    (text) => {
      expect(parseTime(text)).toBeNull();
    },
  );
});

describe('findOverlaps', () => {
  it('finds overlapping intervals of the same day', () => {
    expect(findOverlaps([at(1, '10:00', '14:00'), at(1, '13:00', '18:00')])).toEqual([[0, 1]]);
  });

  it('allows touching intervals: [10:00, 12:00) and [12:00, 14:00)', () => {
    expect(findOverlaps([at(1, '10:00', '12:00'), at(1, '12:00', '14:00')])).toEqual([]);
    // …in either order
    expect(findOverlaps([at(1, '12:00', '14:00'), at(1, '10:00', '12:00')])).toEqual([]);
  });

  it('ignores the same time on different days', () => {
    expect(findOverlaps([at(1, '10:00', '18:00'), at(2, '10:00', '18:00')])).toEqual([]);
  });

  it('finds an interval nested inside another', () => {
    expect(findOverlaps([at(3, '09:00', '18:00'), at(3, '12:00', '13:00')])).toEqual([[0, 1]]);
  });
});

describe('sortIntervals', () => {
  it('orders by weekday, then start', () => {
    const sorted = sortIntervals([
      at(2, '10:00', '11:00'),
      at(1, '15:00', '16:00'),
      at(1, '09:00', '10:00'),
    ]);
    expect(sorted.map((i) => `${i.weekday} ${formatTime(i.startMinute)}`)).toEqual([
      '1 09:00',
      '1 15:00',
      '2 10:00',
    ]);
  });
});
