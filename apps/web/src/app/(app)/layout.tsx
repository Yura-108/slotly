import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { LogoutButton } from '@/features/auth/components/logout-button';
import { ResendVerificationBanner } from '@/features/auth/components/resend-verification';
import { getCurrentUser } from '@/features/auth/server';

/** Signed-in area. The API decides whether the session is valid (frontend.md §3). */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
          <Link href="/bookings" className="text-lg font-semibold tracking-tight">
            Slotly
          </Link>
          <nav className="flex items-center gap-4">
            <Link href="/profile" className="text-sm text-slate-600 hover:text-slate-900">
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
