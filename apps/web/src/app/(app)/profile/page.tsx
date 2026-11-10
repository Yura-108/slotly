import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/features/auth/server';
import { ProfileForm } from '@/features/profile/components/profile-form';

export const metadata: Metadata = { title: 'Профиль — Slotly' };

export default async function ProfilePage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/profile');

  // Same runtime as the API, so every zone offered here is one the API accepts.
  // UTC is an alias that supportedValuesOf omits.
  const zones = new Set(['UTC', ...Intl.supportedValuesOf('timeZone'), user.timezone]);

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Профиль</h1>
        <p className="text-slate-600">{user.email}</p>
      </div>
      <ProfileForm
        defaults={{ name: user.name, timezone: user.timezone }}
        timeZones={[...zones].sort()}
      />
    </section>
  );
}
