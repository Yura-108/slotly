import 'server-only';
import { cookies, headers } from 'next/headers';
import createClient from 'openapi-fetch';
import { loadServerEnv } from '../config/server-env';
import type { paths } from './schema';

/**
 * Client for Server Components: calls the API directly at its internal address,
 * acting on behalf of the user who requested the page (ADR-005).
 * Reads only; changes go from the browser through /api/* (CLAUDE.md rule 10).
 */
export async function serverApi() {
  // Read per request, not at import: the build imports this module and has no API address
  // (ADR-018); validation is cheap next to the HTTP call
  const { API_INTERNAL_URL } = loadServerEnv();
  const [cookieStore, incoming] = await Promise.all([cookies(), headers()]);
  const forwarded: Record<string, string> = { cookie: cookieStore.toString() };
  // Without it every SSR request would look like one client (the Next.js server) to the
  // API's per-IP rate limit. Set by the platform load balancer in production.
  const clientIp = incoming.get('x-forwarded-for');
  if (clientIp) forwarded['x-forwarded-for'] = clientIp;

  return createClient<paths>({ baseUrl: API_INTERNAL_URL, headers: forwarded, cache: 'no-store' });
}
