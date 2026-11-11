import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/features/auth/server';
import { getMySchedule } from '@/features/schedule/server';
import { getMySpecialistProfile } from '@/features/specialist-profile/server';

/**
 * Where a signed-in user starts (after sign-in without `?next=`). Decided on the server in
 * one place: a client books and watches their bookings; a specialist without a schedule
 * has no slots yet, so the first step is the schedule; otherwise the daily task is to
 * answer requests before they expire.
 */
export default async function StartPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const specialist = await getMySpecialistProfile();
  if (!specialist) redirect('/bookings');

  const schedule = await getMySchedule();
  if (schedule === 'profile_required' || schedule.schedule.intervals.length === 0) {
    redirect('/specialist/schedule');
  }
  redirect('/bookings?as=specialist');
}
