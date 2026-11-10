import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { LogoutButton } from '@/features/auth/components/logout-button';
import { ResendVerificationBanner } from '@/features/auth/components/resend-verification';
import { getCurrentUser } from '@/features/auth/server';
import { getMySpecialistProfile } from '@/features/specialist-profile/server';

/** Signed-in area. The API decides whether the session is valid (frontend.md §3). */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  const specialist = await getMySpecialistProfile();

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <Link href="/bookings" className="text-lg font-semibold tracking-tight">
            Slotly
          </Link>
          <nav className="flex flex-wrap items-center gap-4 text-sm">
            <Link href="/bookings" className="text-slate-600 hover:text-slate-900">
              Мои записи
            </Link>
            {specialist ? (
              <>
                <Link href="/specialist/services" className="text-slate-600 hover:text-slate-900">
                  Услуги
                </Link>
                <Link href="/specialist/schedule" className="text-slate-600 hover:text-slate-900">
                  Расписание
                </Link>
                <Link href="/specialist/settings" className="text-slate-600 hover:text-slate-900">
                  Профиль специалиста
                </Link>
              </>
            ) : (
              <Link href="/specialist/settings" className="text-slate-600 hover:text-slate-900">
                Стать специалистом
              </Link>
            )}
            <Link href="/profile" className="text-slate-600 hover:text-slate-900">
              {user.name}
            </Link>
            <LogoutButton />
          </nav>
        </div>
      </header>
      {!user.emailVerified && <ResendVerificationBanner email={user.email} />}
      <main className="mx-auto max-w-4xl px-4 py-8">{children}</main>
    </div>
  );
}
