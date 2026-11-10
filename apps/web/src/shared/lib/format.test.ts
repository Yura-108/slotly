import { describe, expect, it } from 'vitest';
import { formatDuration } from './format';

describe('formatDuration', () => {
  it.each([
    [15, '15 мин'],
    [60, '1 ч'],
    [90, '1 ч 30 мин'],
    [480, '8 ч'],
  ])('%i → %s', (minutes, text) => {
    expect(formatDuration(minutes)).toBe(text);
  });
});
