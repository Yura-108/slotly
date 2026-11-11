'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { api } from '@/shared/api/client';
import { problemMessage } from '@/shared/api/errors';
import { formatDuration } from '@/shared/lib/format';
import { useBrowserTimeZone } from '@/shared/lib/use-browser-time-zone';
import { FormAlert } from '@/shared/ui/form';
import { dateKey, groupByDay, rangeOf, type Slot, weekDays } from '../lib/slot-grid';

interface ServiceOption {
  id: string;
  name: string;
  description: string | null;
  durationMinutes: number;
}

/**
 * Service choice and the week of free slots, in the viewer's time zone. Rendered only in
 * the browser: the server does not know the viewer's zone (frontend.md §6).
 */
export function SlotPicker({ slug, services }: { slug: string; services: ServiceOption[] }) {
  const timeZone = useBrowserTimeZone();
  const [serviceId, setServiceId] = useState(services[0]?.id ?? '');
  const [weekOffset, setWeekOffset] = useState(0);
  // Fixed for the page's life: "this week" must not move while the user browses
  const [today] = useState(() => new Date());

  const days = useMemo(() => weekDays(today, weekOffset), [today, weekOffset]);
  const range = useMemo(() => rangeOf(days), [days]);

  const slots = useQuery({
    queryKey: ['slots', slug, serviceId, range.from, range.to],
    queryFn: async (): Promise<Slot[]> => {
      const { data, error } = await api.GET('/specialists/{slug}/slots', {
        params: { path: { slug }, query: { serviceId, ...range } },
      });
      if (error) throw error;
      return data.items;
    },
    enabled: timeZone !== null && serviceId !== '',
    // Keep last week's grid on screen while the next one loads
    placeholderData: keepPreviousData,
  });

  return (
    <div className="flex flex-col gap-6">
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium text-slate-700">Услуга</legend>
        {services.map((service) => (
          <label
            key={service.id}
            className="flex cursor-pointer gap-3 rounded-lg border border-slate-200 p-4 has-checked:border-slate-900"
          >
            <input
              type="radio"
              name="service"
              value={service.id}
              checked={service.id === serviceId}
              onChange={() => setServiceId(service.id)}
              className="mt-1"
            />
            <span className="flex flex-col">
              <span className="font-medium">{service.name}</span>
              <span className="text-sm text-slate-600">
                {formatDuration(service.durationMinutes)}
              </span>
              {service.description && (
                <span className="mt-1 text-sm text-slate-600">{service.description}</span>
              )}
            </span>
          </label>
        ))}
      </fieldset>

      {timeZone === null ? (
        <p className="text-slate-600">Загружаем свободное время…</p>
      ) : (
        <WeekView
          days={days}
          timeZone={timeZone}
          slots={slots.data}
          loading={slots.isPending || slots.isPlaceholderData}
          error={slots.isError ? problemMessage(slots.error) : null}
          weekOffset={weekOffset}
          onWeekChange={setWeekOffset}
        />
      )}
    </div>
  );
}

function WeekView({
  days,
  timeZone,
  slots,
  loading,
  error,
  weekOffset,
  onWeekChange,
}: {
  days: Date[];
  timeZone: string;
  slots: Slot[] | undefined;
  loading: boolean;
  error: string | null;
  weekOffset: number;
  onWeekChange: (offset: number) => void;
}) {
  const formats = useMemo(
    () => ({
      day: new Intl.DateTimeFormat('ru-RU', {
        timeZone,
        weekday: 'short',
        day: 'numeric',
        month: 'long',
      }),
      time: new Intl.DateTimeFormat('ru-RU', { timeZone, hour: '2-digit', minute: '2-digit' }),
    }),
    [timeZone],
  );
  const byDay = useMemo(() => groupByDay(slots ?? [], timeZone), [slots, timeZone]);
  const first = days[0];
  const last = days[days.length - 1];

  return (
    <section className="flex flex-col gap-4" aria-busy={loading}>
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          className="text-sm text-slate-700 underline disabled:text-slate-400 disabled:no-underline"
          disabled={weekOffset === 0}
          onClick={() => onWeekChange(weekOffset - 1)}
        >
          ← Раньше
        </button>
        <p className="font-medium">
          {first && last && `${formats.day.format(first)} — ${formats.day.format(last)}`}
        </p>
        <button
          type="button"
          className="text-sm text-slate-700 underline"
          onClick={() => onWeekChange(weekOffset + 1)}
        >
          Позже →
        </button>
      </div>

      {error && <FormAlert>{error}</FormAlert>}

      <ul className={`flex flex-col gap-3 ${loading ? 'opacity-60' : ''}`}>
        {days.map((day) => {
          const key = dateKey(day, timeZone);
          const daySlots = byDay.get(key) ?? [];
          return (
            <li key={key} className="flex flex-col gap-2 border-b border-slate-100 pb-3">
              <p className="text-sm font-medium text-slate-700 first-letter:uppercase">
                {formats.day.format(day)}
              </p>
              {daySlots.length === 0 ? (
                <p className="text-sm text-slate-500">{slots ? 'Нет свободного времени' : '…'}</p>
              ) : (
                <ul className="flex flex-wrap gap-2">
                  {daySlots.map((slot) => (
                    <li
                      key={slot.start}
                      className="rounded-md border border-slate-300 px-3 py-1 text-sm tabular-nums"
                    >
                      {formats.time.format(new Date(slot.start))}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>

      <p className="text-sm text-slate-500">Время указано в вашем часовом поясе: {timeZone}.</p>
    </section>
  );
}
