import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { LogoutButton } from '@/features/auth/components/logout-button';
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
          <div className="flex items-center gap-4">
            <span className="text-sm text-slate-600">{user.name}</span>
            <LogoutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-4 py-8">{children}</main>
    </div>
  );
}
