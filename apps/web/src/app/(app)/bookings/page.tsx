import type { Metadata } from 'next';
import Link from 'next/link';
import { getCurrentUser } from '@/features/auth/server';
import { BookingCard } from '@/features/my-bookings/components/booking-card';
import { type Booking, getMyBookings } from '@/features/my-bookings/server';
import { getMySpecialistProfile } from '@/features/specialist-profile/server';

export const metadata: Metadata = { title: 'Мои записи — Slotly' };

const PAGE = 20;

type Party = 'client' | 'specialist';
type Scope = 'upcoming' | 'past';

const one = (v: string | string[] | undefined) => (typeof v === 'string' ? v : undefined);

export default async function BookingsPage({ searchParams }: PageProps<'/bookings'>) {
  const params = await searchParams;
  const [user, specialist] = await Promise.all([getCurrentUser(), getMySpecialistProfile()]);
  if (!user) return null; // the layout has already redirected

  const party: Party = specialist && one(params.as) === 'specialist' ? 'specialist' : 'client';
  const scope: Scope = one(params.scope) === 'past' ? 'past' : 'upcoming';
  const offset = Math.max(0, Number(one(params.offset)) || 0);
  const href = (q: { as?: Party; scope?: Scope; offset?: number }) => {
    const next = new URLSearchParams({ as: q.as ?? party, scope: q.scope ?? scope });
    if (q.offset) next.set('offset', String(q.offset));
    return `/bookings?${next.toString()}`;
  };

  // A specialist's upcoming view puts requests waiting for an answer first: they expire
  const waiting =
    party === 'specialist' && scope === 'upcoming'
      ? await getMyBookings({ as: party, scope, status: 'pending', limit: 100 })
      : null;
  const list = await getMyBookings({
    as: party,
    scope,
    ...(waiting ? { status: 'confirmed' as const } : {}),
    limit: PAGE,
    offset,
  });

  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Мои записи</h1>

      <nav className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
        {specialist && (
          <span className="flex gap-3">
            <Tab href={href({ as: 'specialist', offset: 0 })} active={party === 'specialist'}>
              Ко мне
            </Tab>
            <Tab href={href({ as: 'client', offset: 0 })} active={party === 'client'}>
              Мои
            </Tab>
          </span>
        )}
        <span className="flex gap-3">
          <Tab href={href({ scope: 'upcoming', offset: 0 })} active={scope === 'upcoming'}>
            Предстоящие
          </Tab>
          <Tab href={href({ scope: 'past', offset: 0 })} active={scope === 'past'}>
            Прошедшие
          </Tab>
        </span>
      </nav>

      {waiting && waiting.items.length > 0 && (
        <BookingList
          title={`Ждут ответа (${waiting.total})`}
          items={waiting.items}
          timeZone={user.timezone}
        />
      )}

      <BookingList
        title={waiting ? 'Подтверждённые' : undefined}
        items={list.items}
        timeZone={user.timezone}
        empty={
          party === 'client' && scope === 'upcoming'
            ? 'Предстоящих записей нет. Запишитесь к специалисту по ссылке на его страницу.'
            : 'Записей нет.'
        }
      />

      {(offset > 0 || offset + PAGE < list.total) && (
        <div className="flex justify-between text-sm">
          {offset > 0 ? (
            <Link href={href({ offset: Math.max(0, offset - PAGE) })} className="underline">
              ← Назад
            </Link>
          ) : (
            <span />
          )}
          {offset + PAGE < list.total && (
            <Link href={href({ offset: offset + PAGE })} className="underline">
              Дальше →
            </Link>
          )}
        </div>
      )}
      <p className="text-sm text-slate-500">
        Время указано в вашем часовом поясе: {user.timezone}.
      </p>
    </section>
  );
}

function Tab({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className="text-slate-600 hover:text-slate-900 aria-[current=page]:font-semibold aria-[current=page]:text-slate-900"
    >
      {children}
    </Link>
  );
}

function BookingList({
  title,
  items,
  timeZone,
  empty,
}: {
  title?: string;
  items: Booking[];
  timeZone: string;
  empty?: string;
}) {
  return (
    <div className="flex flex-col gap-3">
      {title && <h2 className="text-lg font-medium">{title}</h2>}
      {items.length === 0 ? (
        empty && <p className="text-slate-600">{empty}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((b) => (
            <BookingCard key={b.id} booking={b} timeZone={timeZone} />
          ))}
        </ul>
      )}
    </div>
  );
}
