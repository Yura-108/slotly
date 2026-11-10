import 'server-only';
import { serverApi } from '@/shared/api/server-client';
import type { components } from '@/shared/api/schema';

export type MyService = components['schemas']['MyService_Output'];

/** 'profile_required' when the user is not a specialist yet (API answers 403). */
export async function getMyServices(): Promise<MyService[] | 'profile_required'> {
  const api = await serverApi();
  const { data, error, response } = await api.GET('/me/services');
  if (data) return data.items;
  if (error?.code === 'SPECIALIST_PROFILE_REQUIRED') return 'profile_required';
  throw new Error(`GET /me/services failed with ${response.status} ${error?.code ?? ''}`);
}
