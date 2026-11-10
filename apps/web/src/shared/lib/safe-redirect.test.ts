import { describe, expect, it } from 'vitest';
import { safeRedirectPath } from './safe-redirect';

describe('safeRedirectPath', () => {
  it('keeps a same-site path with query', () => {
    expect(safeRedirectPath('/specialist/bookings?status=pending')).toBe(
      '/specialist/bookings?status=pending',
    );
  });

  it.each([
    null,
    '',
    'https://evil.example',
    '//evil.example/path',
    '/\\evil.example',
    'javascript:alert(1)',
    'bookings',
  ])('falls back for %j', (next) => {
    expect(safeRedirectPath(next)).toBe('/bookings');
  });
});
