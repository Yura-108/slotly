import type { Metadata } from 'next';
import Link from 'next/link';
import { DaysOffEditor } from '@/features/schedule/components/days-off-editor';
import { WeekEditor } from '@/features/schedule/components/week-editor';
import { getMySchedule } from '@/features/schedule/server';

export const metadata: Metadata = { title: 'Расписание — Slotly' };

/** "Today" for the date picker in the specialist's zone; the API checks it again. */
function todayIn(timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export default async function SchedulePage() {
  const data = await getMySchedule();

  if (data === 'profile_required') {
    return (
      <section className="flex flex-col gap-4">
        <h1 className="text-2xl font-semibold">Расписание</h1>
        <p className="text-slate-600">
          Расписание доступно специалистам.{' '}
          <Link href="/specialist/settings" className="font-medium text-slate-900 underline">
            Включить профиль специалиста
          </Link>
        </p>
      </section>
    );
  }

  return (
    <div className="flex flex-col gap-10">
      <section className="flex flex-col gap-4">
        <h1 className="text-2xl font-semibold">Расписание</h1>
        <WeekEditor schedule={data.schedule} />
      </section>
      <section className="flex flex-col gap-4">
        <h2 className="text-xl font-semibold">Выходные дни</h2>
        <DaysOffEditor daysOff={data.daysOff} today={todayIn(data.schedule.timezone)} />
      </section>
    </div>
  );
}
