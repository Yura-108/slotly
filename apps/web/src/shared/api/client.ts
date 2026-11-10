import createClient from 'openapi-fetch';
import type { paths } from './schema';

/**
 * Browser client: every change goes browser → /api/* → API (ADR-009), so the session
 * cookie, Origin check and Problem Details work the same for all mutations.
 */
export const api = createClient<paths>({ baseUrl: '/api' });
