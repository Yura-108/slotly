import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getSpecialistPage } from '@/features/booking/server';
import { formatDuration } from '@/shared/lib/format';

export async function generateMetadata({ params }: PageProps<'/book/[slug]'>): Promise<Metadata> {
  const page = await getSpecialistPage((await params).slug);
  return { title: page ? `${page.specialist.displayName} — запись онлайн` : 'Страница не найдена' };
}

/** Public page (no sign-in needed). Under /book/ so app routes never clash with slugs. */
export default async function SpecialistPublicPage({ params }: PageProps<'/book/[slug]'>) {
  const page = await getSpecialistPage((await params).slug);
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
        <h2 className="text-xl font-medium">Услуги</h2>
        {services.length === 0 ? (
          <p className="text-slate-600">Специалист пока не добавил услуги.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {services.map((service) => (
              <li key={service.id} className="rounded-lg border border-slate-200 p-4">
                <p className="font-medium">{service.name}</p>
                <p className="text-sm text-slate-600">{formatDuration(service.durationMinutes)}</p>
                {service.description && (
                  <p className="mt-1 text-sm text-slate-600">{service.description}</p>
                )}
              </li>
            ))}
          </ul>
        )}
        <p className="text-sm text-slate-500">
          Выбор времени для записи скоро появится на этой странице.
        </p>
      </section>
    </main>
  );
}
