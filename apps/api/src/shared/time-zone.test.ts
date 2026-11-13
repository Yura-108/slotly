import { describe, expect, it } from 'vitest';
import { isValidTimeZone } from './time-zone';

describe('isValidTimeZone', () => {
  it.each(['Europe/Moscow', 'America/New_York', 'Asia/Kolkata', 'UTC'])('accepts %s', (tz) => {
    expect(isValidTimeZone(tz)).toBe(true);
  });
});
