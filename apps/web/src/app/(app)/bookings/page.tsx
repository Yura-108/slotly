import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Мои записи — Slotly' };

export default function BookingsPage() {
  return (
    <section className="flex flex-col gap-2">
      <h1 className="text-2xl font-semibold">Мои записи</h1>
      <p className="text-slate-600">Здесь появятся ваши записи к специалистам.</p>
    </section>
  );
}
