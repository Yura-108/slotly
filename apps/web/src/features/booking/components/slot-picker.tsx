'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { api } from '@/shared/api/client';
import { problemMessage } from '@/shared/api/errors';
import { formatDuration } from '@/shared/lib/format';
import { useBrowserTimeZone } from '@/shared/lib/use-browser-time-zone';
import { FormAlert, Notice } from '@/shared/ui/form';
import {
  dateKey,
  groupByDay,
  rangeOf,
  type Slot,
  type SlotFormats,
  slotFormats,
  slotLabel,
  weekDays,
} from '../lib/slot-grid';
import { BookingConfirm, type CreatedBooking, type Viewer } from './booking-confirm';

interface ServiceOption {
  id: string;
  name: string;
  description: string | null;
  durationMinutes: number;
}

type Outcome =
  { kind: 'booked'; booking: CreatedBooking; label: string } | { kind: 'gone'; message: string };

/**
 * Service choice, the week of free slots in the viewer's time zone, and booking. Rendered
 * only in the browser: the server does not know the viewer's zone (frontend.md §6).
 */
export function SlotPicker({
  slug,
  services,
  viewer,
}: {
  slug: string;
  services: ServiceOption[];
  viewer: Viewer;
}) {
  const timeZone = useBrowserTimeZone();
  const [serviceId, setServiceId] = useState(services[0]?.id ?? '');
  const [weekOffset, setWeekOffset] = useState(0);
  const [selected, setSelected] = useState<Slot | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  // Fixed for the page's life: "this week" must not move while the user browses
  const [today] = useState(() => new Date());

  const days = useMemo(() => weekDays(today, weekOffset), [today, weekOffset]);
  const range = useMemo(() => rangeOf(days), [days]);
  const formats = useMemo(() => (timeZone ? slotFormats(timeZone) : null), [timeZone]);

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

  const select = (slot: Slot | null) => {
    setSelected(slot);
    setOutcome(null);
  };

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
              onChange={() => {
                setServiceId(service.id);
                select(null);
              }}
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

      {timeZone === null || formats === null ? (
        <p className="text-slate-600">Загружаем свободное время…</p>
      ) : (
        <>
          <WeekView
            days={days}
            timeZone={timeZone}
            formats={formats}
            slots={slots.data}
            loading={slots.isPending || slots.isPlaceholderData}
            error={slots.isError ? problemMessage(slots.error) : null}
            selected={selected}
            onSelect={select}
            weekOffset={weekOffset}
            onWeekChange={(offset) => {
              setWeekOffset(offset);
              select(null);
            }}
          />
          {outcome?.kind === 'booked' && <BookedNotice {...outcome} />}
          {outcome?.kind === 'gone' && <FormAlert>{outcome.message}</FormAlert>}
          {selected && (
            <BookingConfirm
              key={selected.start}
              slug={slug}
              serviceId={serviceId}
              slot={selected}
              label={slotLabel(selected, formats)}
              viewer={viewer}
              onBooked={(booking) => {
                setSelected(null);
                setOutcome({ kind: 'booked', booking, label: slotLabel(selected, formats) });
              }}
              onSlotGone={(message) => {
                setSelected(null);
                setOutcome({ kind: 'gone', message });
              }}
            />
          )}
        </>
      )}
    </div>
  );
}

function BookedNotice({ booking, label }: { booking: CreatedBooking; label: string }) {
  return (
    <Notice>
      {booking.status === 'confirmed'
        ? `Вы записаны: ${booking.serviceName}, ${label}. `
        : `Заявка отправлена: ${booking.serviceName}, ${label}. Специалист ответит в течение 24 часов, мы сообщим о решении письмом. `}
      <Link href="/bookings" className="font-medium underline">
        Мои записи
      </Link>
    </Notice>
  );
}

function WeekView({
  days,
  timeZone,
  formats,
  slots,
  loading,
  error,
  selected,
  onSelect,
  weekOffset,
  onWeekChange,
}: {
  days: Date[];
  timeZone: string;
  formats: SlotFormats;
  slots: Slot[] | undefined;
  loading: boolean;
  error: string | null;
  selected: Slot | null;
  onSelect: (slot: Slot) => void;
  weekOffset: number;
  onWeekChange: (offset: number) => void;
}) {
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
                  {daySlots.map((slot) => {
                    const isSelected = slot.start === selected?.start;
                    return (
                      <li key={slot.start}>
                        <button
                          type="button"
                          aria-pressed={isSelected}
                          onClick={() => onSelect(slot)}
                          className="rounded-md border border-slate-300 px-3 py-1 text-sm tabular-nums hover:border-slate-900 aria-pressed:border-slate-900 aria-pressed:bg-slate-900 aria-pressed:text-white"
                        >
                          {formats.time.format(new Date(slot.start))}
                        </button>
                      </li>
                    );
                  })}
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
