import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getCurrentUser } from '@/features/auth/server';
import { SlotPicker } from '@/features/booking/components/slot-picker';
import { getSpecialistPage } from '@/features/booking/server';

export async function generateMetadata({ params }: PageProps<'/book/[slug]'>): Promise<Metadata> {
  const page = await getSpecialistPage((await params).slug);
  return { title: page ? `${page.specialist.displayName} — запись онлайн` : 'Страница не найдена' };
}

/** Public page (no sign-in needed). Under /book/ so app routes never clash with slugs. */
export default async function SpecialistPublicPage({ params }: PageProps<'/book/[slug]'>) {
  const [page, user] = await Promise.all([
    getSpecialistPage((await params).slug),
    getCurrentUser(),
  ]);
  if (!page) notFound();
  const { specialist, services } = page;

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-8 px-4 py-12">
      <Link href="/" className="text-lg font-semibold tracking-tight">
        Slotly
      </Link>
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold">{specialist.displayName}</h1>
        {specialist.bio && <p className="whitespace-pre-line text-slate-700">{specialist.bio}</p>}
      </header>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-medium">Записаться</h2>
        {services.length === 0 ? (
          <p className="text-slate-600">Специалист пока не добавил услуги.</p>
        ) : (
          <SlotPicker
            slug={specialist.slug}
            services={services}
            viewer={user && { emailVerified: user.emailVerified }}
          />
        )}
      </section>
    </main>
  );
}
