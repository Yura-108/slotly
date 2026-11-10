import 'server-only';
import { serverApi } from '@/shared/api/server-client';
import type { components } from '@/shared/api/schema';

export type CurrentUser = components['schemas']['Me_Output'];

/** The API is the source of truth about the session; null means "not signed in". */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const api = await serverApi();
  const { data, error, response } = await api.GET('/me');
  if (data) return data;
  if (response.status === 401) return null;
  // Anything else is unexpected: let the error boundary show it, with the request id in logs
  throw new Error(`GET /me failed with ${response.status} ${error?.code ?? ''}`.trim());
}
