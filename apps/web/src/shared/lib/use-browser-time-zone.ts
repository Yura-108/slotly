'use client';

import { useSyncExternalStore } from 'react';

const subscribe = () => () => {};
const browserTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

/**
 * The browser's IANA time zone, or null during server rendering. The server's zone differs
 * from the user's, so reading it while rendering on the server would produce HTML that does
 * not match the client (hydration mismatch, frontend.md §6).
 */
export function useBrowserTimeZone(): string | null {
  return useSyncExternalStore(subscribe, browserTimeZone, () => null);
}
