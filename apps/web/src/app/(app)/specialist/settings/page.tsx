import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/features/auth/server';
import { SpecialistProfileForm } from '@/features/specialist-profile/components/specialist-profile-form';
import { getMySpecialistProfile } from '@/features/specialist-profile/server';
import { availableTimeZones } from '@/shared/lib/time-zones';

export const metadata: Metadata = { title: 'Профиль специалиста — Slotly' };

export default async function SpecialistSettingsPage() {
  const [user, profile] = await Promise.all([getCurrentUser(), getMySpecialistProfile()]);
  if (!user) redirect('/login?next=/specialist/settings');

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">
          {profile ? 'Профиль специалиста' : 'Стать специалистом'}
        </h1>
        {profile ? (
          <p className="text-slate-600">
            Ваша страница:{' '}
            <Link href={`/book/${profile.slug}`} className="font-medium underline">
              /book/{profile.slug}
            </Link>
          </p>
        ) : (
          <p className="text-slate-600">
            Опишите себя, выберите адрес страницы и правила записи — клиенты смогут записываться к
            вам онлайн.
          </p>
        )}
      </div>
      {!profile && !user.emailVerified ? (
        // The API refuses with EMAIL_NOT_VERIFIED anyway; the UI explains it up front (FR-2)
        <p className="rounded-md bg-amber-50 px-3 py-2 text-amber-900">
          Чтобы включить профиль специалиста, подтвердите email — ссылка в письме, которое мы
          отправили при регистрации.
        </p>
      ) : (
        <SpecialistProfileForm
          profile={profile}
          defaultTimeZone={user.timezone}
          timeZones={availableTimeZones(profile?.timezone ?? user.timezone)}
        />
      )}
    </section>
  );
}
