import 'server-only';
import { serverApi } from '@/shared/api/server-client';
import type { components } from '@/shared/api/schema';

export type WeeklySchedule = components['schemas']['WeeklySchedule_Output'];
export type DayOff = components['schemas']['DayOff_Output'];

/** 'profile_required' when the user is not a specialist yet (API answers 403). */
export async function getMySchedule(): Promise<
  { schedule: WeeklySchedule; daysOff: DayOff[] } | 'profile_required'
> {
  const api = await serverApi();
  const [schedule, daysOff] = await Promise.all([
    api.GET('/me/availability'),
    api.GET('/me/days-off'),
  ]);
  if (schedule.error?.code === 'SPECIALIST_PROFILE_REQUIRED') return 'profile_required';
  if (!schedule.data || !daysOff.data) {
    throw new Error(`Schedule failed: ${schedule.response.status}/${daysOff.response.status}`);
  }
  return { schedule: schedule.data, daysOff: daysOff.data.items };
}
