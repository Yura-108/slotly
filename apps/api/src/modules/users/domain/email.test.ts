import { describe, expect, it } from 'vitest';
import { normalizeEmail } from './email';

describe('normalizeEmail', () => {
  it('trims and lower-cases', () => {
    expect(normalizeEmail('  Anna.Petrova@Example.COM ')).toBe('anna.petrova@example.com');
  });
});
