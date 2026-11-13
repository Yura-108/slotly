/** Where the web server proxies the browser's API calls (proxy.ts). */
export const API_PREFIX = '/api';

export const isApiPath = (pathname: string) =>
  pathname === API_PREFIX || pathname.startsWith(`${API_PREFIX}/`);

/**
 * `/api/x?y` → `${apiUrl}/x?y`. The browser talks to one origin, so the session cookie
 * stays first-party (ADR-005); the API address comes from the environment at run time
 * (ADR-018).
 */
export function apiTarget(pathname: string, search: string, apiUrl: string): URL {
  const target = new URL(apiUrl);
  target.pathname = pathname.slice(API_PREFIX.length) || '/';
  target.search = search;
  return target;
}
