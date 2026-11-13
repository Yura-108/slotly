import { describe, expect, it } from 'vitest';
import { apiTarget, isApiPath } from './api-target';

describe('apiTarget', () => {
  it('drops the /api prefix and keeps the path and query', () => {
    expect(
      apiTarget('/api/specialists/anna/slots', '?from=2026-11-13', 'http://127.0.0.1:4000').href,
    ).toBe('http://127.0.0.1:4000/specialists/anna/slots?from=2026-11-13');
  });

  it('maps /api itself to the API root', () => {
    expect(apiTarget('/api', '', 'http://api.internal:4000').href).toBe(
      'http://api.internal:4000/',
    );
  });

  it('never leaves the API host, whatever the path', () => {
    for (const path of ['/api//evil.example/x', '/api/@evil.example', '/api/%2F%2Fevil.example']) {
      expect(apiTarget(path, '', 'http://127.0.0.1:4000').host).toBe('127.0.0.1:4000');
    }
  });
});

describe('isApiPath', () => {
  it('matches /api and its subpaths only', () => {
    expect(isApiPath('/api')).toBe(true);
    expect(isApiPath('/api/health/live')).toBe(true);
    expect(isApiPath('/apiary')).toBe(false);
    expect(isApiPath('/bookings')).toBe(false);
  });
});
