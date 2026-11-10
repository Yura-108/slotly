'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/shared/api/client';
import { fieldErrors, problemMessage } from '@/shared/api/errors';
import { Button, FormAlert } from '@/shared/ui/form';
import type { DayOff } from '../server';

const formatDate = (iso: string) =>
  // A local calendar date, not an instant: format it as UTC so no zone shifts the day
  new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    weekday: 'short',
    timeZone: 'UTC',
  }).format(new Date(`${iso}T00:00:00Z`));

export function DaysOffEditor({ daysOff, today }: { daysOff: DayOff[]; today: string }) {
  const router = useRouter();
  const [date, setDate] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function add() {
    if (!date) return;
    setBusy(true);
    setError(null);
    try {
      const { error: problem } = await api.POST('/me/days-off', { body: { date } });
      if (problem) {
        setError(fieldErrors(problem)['date'] ?? problemMessage(problem));
        return;
      }
      setDate('');
      router.refresh();
    } catch (cause) {
      setError(problemMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setError(null);
    try {
      const { error: problem } = await api.DELETE('/me/days-off/{id}', {
        params: { path: { id } },
      });
      if (problem) setError(problemMessage(problem));
      else router.refresh();
    } catch (cause) {
      setError(problemMessage(cause));
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {error && <FormAlert>{error}</FormAlert>}
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1">
          <label htmlFor="day-off" className="text-sm font-medium text-slate-700">
            Дата
          </label>
          <input
            id="day-off"
            type="date"
            min={today}
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-md border border-slate-300 px-3 py-2"
          />
        </div>
        <Button type="button" onClick={() => void add()} disabled={busy || !date}>
          Добавить выходной
        </Button>
      </div>
      {daysOff.length === 0 ? (
        <p className="text-slate-600">Ближайших выходных нет.</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {daysOff.map((d) => (
            <li key={d.id} className="flex items-center gap-3">
              <span>{formatDate(d.date)}</span>
              <button
                type="button"
                className="text-sm text-slate-600 underline"
                onClick={() => void remove(d.id)}
              >
                Убрать
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
