import type { NextFunction, Request, Response } from 'express';

/**
 * Headers for every API response (security.md, A02). The API serves only JSON to our own
 * web app, so the policy is the strictest one: nothing may be rendered, framed, sniffed or
 * stored. A dozen fixed headers do not justify a dependency (helmet targets HTML sites).
 */
export const API_SECURITY_HEADERS: Readonly<Record<string, string>> = {
  // Responses hold personal data and depend on the session: no browser or proxy cache
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  // A response opened directly in a tab can run nothing and cannot be framed
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
  'Referrer-Policy': 'no-referrer',
  // Other sites cannot embed our responses (as <script>, <img>…) to read side channels
  'Cross-Origin-Resource-Policy': 'same-origin',
};

export function securityHeaders(_req: Request, res: Response, next: NextFunction): void {
  res.set(API_SECURITY_HEADERS);
  next();
}
