import { type NextRequest, NextResponse } from 'next/server';
import { loadServerEnv } from '@/shared/config/server-env';
import { contentSecurityPolicy, newNonce } from '@/shared/config/security-headers';

const { SESSION_COOKIE_NAME, NODE_ENV } = loadServerEnv();

/** Pages that need a session (the optimistic redirect below). */
const PROTECTED = ['/bookings', '/profile', '/specialist', '/start'];
const isProtected = (path: string) =>
  PROTECTED.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));

/**
 * Runs before every page:
 * 1. Content-Security-Policy with a fresh nonce (ADR-014). The policy goes on the request
 *    too: Next.js reads the nonce from it while rendering and marks its own scripts.
 * 2. Optimistic redirect (frontend.md §3): no cookie → straight to the login page, without
 *    rendering a protected page first. This is NOT a security boundary — the cookie is not
 *    validated here; the (app) layout asks the API, and the API checks every request.
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (isProtected(pathname) && !request.cookies.has(SESSION_COOKIE_NAME)) {
    const login = new URL('/login', request.url);
    login.searchParams.set('next', `${pathname}${search}`);
    return NextResponse.redirect(login);
  }

  const csp = contentSecurityPolicy(newNonce(), { dev: NODE_ENV === 'development' });
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('Content-Security-Policy', csp);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', csp);
  return response;
}

export const config = {
  // Every page; not the API proxy (the API sends its own headers) and not static files
  matcher: ['/((?!api/|_next/static/|_next/image|favicon.ico).*)'],
};
