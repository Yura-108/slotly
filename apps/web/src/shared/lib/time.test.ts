import { describe, expect, it } from 'vitest';
import { formatMoment, formatTimeRange } from './time';

describe('time formatting', () => {
  it('shows the same booking on different clocks', () => {
    const [start, end] = ['2026-11-19T11:00:00.000Z', '2026-11-19T12:00:00.000Z'];
    expect(formatTimeRange(start, end, 'Europe/Berlin')).toBe('чт, 19 ноября, 12:00–13:00');
    expect(formatTimeRange(start, end, 'Europe/Moscow')).toBe('чт, 19 ноября, 14:00–15:00');
  });

  it('formats a single moment', () => {
    expect(formatMoment('2026-11-18T21:30:00.000Z', 'Asia/Vladivostok')).toBe(
      'чт, 19 ноября, 07:30',
    );
  });
});
