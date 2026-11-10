'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/shared/api/client';
import { fieldErrors, problemMessage } from '@/shared/api/errors';
import { Button, FormAlert, Notice } from '@/shared/ui/form';
import type { WeeklySchedule } from '../server';

const WEEKDAYS = [
  [1, 'Понедельник'],
  [2, 'Вторник'],
  [3, 'Среда'],
  [4, 'Четверг'],
  [5, 'Пятница'],
  [6, 'Суббота'],
  [7, 'Воскресенье'],
] as const;

// Every 15 minutes, 00:00 … 24:00. <input type="time"> cannot express 24:00 (end of day).
const TIMES = Array.from({ length: 97 }, (_, i) => {
  const minutes = i * 15;
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
});

interface Row {
  key: number;
  start: string;
  end: string;
}

type Week = Record<number, Row[]>;

let nextKey = 0;

function toWeek(schedule: WeeklySchedule): Week {
  const week: Week = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 7: [] };
  for (const i of schedule.intervals) {
    week[i.weekday]?.push({ key: nextKey++, start: i.start, end: i.end });
  }
  return week;
}

/** The order the intervals are sent in, so `intervals.N` in API errors maps back to a row. */
function flatten(week: Week) {
  return WEEKDAYS.flatMap(([weekday]) => (week[weekday] ?? []).map((row) => ({ weekday, row })));
}

/**
 * Edits the whole week locally and saves it with one PUT (atomic replacement on the API).
 * Overlap checks are the API's: its field errors point at the exact interval.
 */
export function WeekEditor({ schedule }: { schedule: WeeklySchedule }) {
  const router = useRouter();
  const [week, setWeek] = useState<Week>(() => toWeek(schedule));
  const [rowErrors, setRowErrors] = useState<Record<number, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  function update(weekday: number, rows: Row[]) {
    setWeek((current) => ({ ...current, [weekday]: rows }));
    setSaved(false);
  }

  async function save() {
    setSaving(true);
    setFormError(null);
    setRowErrors({});
    const flat = flatten(week);
    try {
      const { error } = await api.PUT('/me/availability', {
        body: {
          intervals: flat.map(({ weekday, row }) => ({ weekday, start: row.start, end: row.end })),
        },
      });
      if (error) {
        const byPath = fieldErrors(error);
        const errors: Record<number, string> = {};
        for (const [path, message] of Object.entries(byPath)) {
          const index = Number(/^intervals\.(\d+)/.exec(path)?.[1]);
          const target = flat[index];
          if (target) errors[target.row.key] = message;
        }
        setRowErrors(errors);
        if (Object.keys(errors).length === 0) setFormError(problemMessage(error));
        return;
      }
      setSaved(true);
      router.refresh();
    } catch (cause) {
      setFormError(problemMessage(cause));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {formError && <FormAlert>{formError}</FormAlert>}
      {saved && <Notice>Расписание сохранено.</Notice>}
      <p className="text-sm text-slate-600">
        Время указано в вашем часовом поясе: <strong>{schedule.timezone}</strong>. Изменение
        расписания не затрагивает уже созданные записи.
      </p>
      <ul className="flex flex-col divide-y divide-slate-200 rounded-lg border border-slate-200">
        {WEEKDAYS.map(([weekday, label]) => {
          const rows = week[weekday] ?? [];
          return (
            <li key={weekday} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-start">
              <span className="w-32 shrink-0 pt-1 font-medium">{label}</span>
              <div className="flex flex-1 flex-col gap-2">
                {rows.length === 0 && <span className="pt-1 text-slate-500">Выходной</span>}
                {rows.map((row) => (
                  <div key={row.key} className="flex flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        aria-label={`${label}: начало`}
                        value={row.start}
                        onChange={(e) =>
                          update(
                            weekday,
                            rows.map((r) =>
                              r.key === row.key ? { ...r, start: e.target.value } : r,
                            ),
                          )
                        }
                        className="rounded-md border border-slate-300 px-2 py-1"
                      >
                        {TIMES.slice(0, -1).map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>
                      <span>—</span>
                      <select
                        aria-label={`${label}: конец`}
                        value={row.end}
                        onChange={(e) =>
                          update(
                            weekday,
                            rows.map((r) =>
                              r.key === row.key ? { ...r, end: e.target.value } : r,
                            ),
                          )
                        }
                        className="rounded-md border border-slate-300 px-2 py-1"
                      >
                        {TIMES.slice(1).map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        className="text-sm text-slate-600 underline"
                        onClick={() =>
                          update(
                            weekday,
                            rows.filter((r) => r.key !== row.key),
                          )
                        }
                      >
                        Удалить
                      </button>
                    </div>
                    {rowErrors[row.key] && (
                      <p role="alert" className="text-sm text-red-700">
                        {rowErrors[row.key]}
                      </p>
                    )}
                  </div>
                ))}
                <button
                  type="button"
                  className="self-start text-sm font-medium underline"
                  onClick={() => {
                    const last = rows.at(-1);
                    update(weekday, [
                      ...rows,
                      last
                        ? {
                            key: nextKey++,
                            start: last.end === '24:00' ? '23:00' : last.end,
                            end: '24:00',
                          }
                        : { key: nextKey++, start: '10:00', end: '18:00' },
                    ]);
                  }}
                >
                  + интервал
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      <Button type="button" onClick={() => void save()} disabled={saving} className="self-start">
        {saving ? 'Сохраняем…' : 'Сохранить расписание'}
      </Button>
    </div>
  );
}
