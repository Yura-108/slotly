import 'server-only';
import { serverApi } from '@/shared/api/server-client';
import type { components } from '@/shared/api/schema';

export type PublicSpecialist = components['schemas']['PublicSpecialist_Output'];
export type PublicService = components['schemas']['PublicService_Output'];

/** Everything the public booking page needs; null for an unknown address (404). */
export async function getSpecialistPage(
  slug: string,
): Promise<{ specialist: PublicSpecialist; services: PublicService[] } | null> {
  const api = await serverApi();
  const path = { params: { path: { slug } } };
  const [profile, services] = await Promise.all([
    api.GET('/specialists/{slug}', path),
    api.GET('/specialists/{slug}/services', path),
  ]);
  if (profile.response.status === 404) return null;
  if (!profile.data || !services.data) {
    throw new Error(
      `Specialist page for "${slug}" failed: ${profile.response.status}/${services.response.status}`,
    );
  }
  return { specialist: profile.data, services: services.data.items };
}
