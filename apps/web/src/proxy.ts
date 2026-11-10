import { type NextRequest, NextResponse } from 'next/server';
import { loadServerEnv } from '@/shared/config/server-env';

const { SESSION_COOKIE_NAME } = loadServerEnv();

/**
 * Optimistic redirect only (frontend.md §3): no cookie → straight to the login page,
 * without rendering a protected page first. This is NOT a security boundary — the cookie
 * is not validated here; the (app) layout asks the API, and the API checks every request.
 */
export function proxy(request: NextRequest) {
  if (request.cookies.has(SESSION_COOKIE_NAME)) return NextResponse.next();

  const login = new URL('/login', request.url);
  login.searchParams.set('next', `${request.nextUrl.pathname}${request.nextUrl.search}`);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ['/bookings/:path*', '/profile/:path*', '/specialist/:path*'],
};
