import 'server-only';
import { cache } from 'react';
import { serverApi } from '@/shared/api/server-client';
import type { components } from '@/shared/api/schema';

export type SpecialistProfile = components['schemas']['SpecialistProfile_Output'];

/**
 * Null when the user has not enabled the specialist profile yet (API answers 404).
 * Cached per request: the layout and the page both ask, the API is called once.
 */
export const getMySpecialistProfile = cache(async (): Promise<SpecialistProfile | null> => {
  const api = await serverApi();
  const { data, error, response } = await api.GET('/me/specialist-profile');
  if (data) return data;
  if (response.status === 404) return null;
  throw new Error(`GET /me/specialist-profile failed with ${response.status} ${error?.code ?? ''}`);
});
