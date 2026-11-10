'use client';

import { useSyncExternalStore } from 'react';

/**
 * Reads `#token=…` from the URL (ADR-008). The fragment never reaches servers, proxies or
 * Referer headers; once read, it is removed from the address bar and history, so it does
 * not linger on screen, in synced tabs or in browser history.
 *
 * The token is kept in memory after the fragment is removed: React may read the snapshot
 * again (re-renders, Strict Mode) and must get the same value. A later link with a new
 * token replaces it.
 */
let captured: string | null = null;

function snapshot(): string | null {
  const token = new URLSearchParams(window.location.hash.slice(1)).get('token');
  if (token) {
    captured = token;
    // Idempotent side effect: safe even if React calls the snapshot several times
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }
  return captured;
}

const subscribe = () => () => {};

/** `undefined` during server rendering, `null` when the link carried no token. */
export function useFragmentToken(): string | null | undefined {
  return useSyncExternalStore(subscribe, snapshot, () => undefined);
}
