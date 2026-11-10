import { describe, expect, it } from 'vitest';
import {
  checkSession,
  SESSION_ABSOLUTE_TIMEOUT_MS,
  SESSION_IDLE_TIMEOUT_MS,
  sessionExpiresAt,
  startSession,
} from './session-policy';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const t0 = new Date('2026-01-01T00:00:00Z');
const at = (ms: number) => new Date(t0.getTime() + ms);

describe('session policy', () => {
  it('starts with the idle timeout as expiry', () => {
    expect(startSession(t0)).toEqual({
      createdAt: t0,
      lastSeenAt: t0,
      expiresAt: at(SESSION_IDLE_TIMEOUT_MS),
    });
  });

  it('caps the sliding expiry by the absolute lifetime', () => {
    expect(sessionExpiresAt(t0, at(80 * DAY))).toEqual(at(SESSION_ABSOLUTE_TIMEOUT_MS));
  });

  it('does not refresh more often than once an hour', () => {
    const session = startSession(t0);
    expect(checkSession(session, at(59 * 60 * 1000))).toEqual({ status: 'active', refresh: null });
  });

  it('slides the expiry forward after an hour of use', () => {
    const session = startSession(t0);
    expect(checkSession(session, at(2 * HOUR))).toEqual({
      status: 'active',
      refresh: { lastSeenAt: at(2 * HOUR), expiresAt: at(2 * HOUR + SESSION_IDLE_TIMEOUT_MS) },
    });
  });

  it('expires exactly at expiresAt', () => {
    const session = startSession(t0);
    expect(checkSession(session, session.expiresAt)).toEqual({ status: 'expired' });
  });

  it('expires after 90 days even with daily activity', () => {
    let session = startSession(t0);
    for (let day = 1; day < 90; day++) {
      const result = checkSession(session, at(day * DAY));
      if (result.status !== 'active') throw new Error(`expired too early on day ${day}`);
      if (result.refresh) session = { ...session, ...result.refresh };
    }
    expect(checkSession(session, at(90 * DAY))).toEqual({ status: 'expired' });
  });
});
