/**
 * Presentation of API slots in the viewer's time zone. The slots themselves come from the
 * API (frontend.md §4): nothing here decides what is free.
 */

export interface Slot {
  start: string;
  end: string;
}

/**
 * Seven calendar days starting `weekOffset` weeks after the day of `now`, as local
 * midnights of the runtime zone — in the browser, the viewer's zone. `Date` handles DST:
 * a skipped midnight becomes the first existing moment of the day.
 */
export function weekDays(now: Date, weekOffset: number): Date[] {
  return Array.from(
    { length: 7 },
    (_, i) => new Date(now.getFullYear(), now.getMonth(), now.getDate() + weekOffset * 7 + i),
  );
}

/** The instants bounding the days: [first midnight, midnight after the last day). */
export function rangeOf(days: readonly Date[]): { from: string; to: string } {
  const first = days[0];
  const last = days[days.length - 1];
  if (!first || !last) throw new Error('rangeOf needs at least one day');
  const after = new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1);
  return { from: first.toISOString(), to: after.toISOString() };
}

const keyFormatters = new Map<string, Intl.DateTimeFormat>();

/** "YYYY-MM-DD" of an instant in a time zone. */
export function dateKey(instant: Date, timeZone: string): string {
  let f = keyFormatters.get(timeZone);
  if (!f) {
    // en-CA formats dates as YYYY-MM-DD
    f = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    keyFormatters.set(timeZone, f);
  }
  return f.format(instant);
}

/** Slots by the viewer's local date, in API order (sorted by start). */
export function groupByDay(slots: readonly Slot[], timeZone: string): Map<string, Slot[]> {
  const days = new Map<string, Slot[]>();
  for (const slot of slots) {
    const key = dateKey(new Date(slot.start), timeZone);
    const list = days.get(key);
    if (list) list.push(slot);
    else days.set(key, [slot]);
  }
  return days;
}

/** Russian date and time formats on the viewer's clock. */
export function slotFormats(timeZone: string) {
  return {
    day: new Intl.DateTimeFormat('ru-RU', {
      timeZone,
      weekday: 'short',
      day: 'numeric',
      month: 'long',
    }),
    time: new Intl.DateTimeFormat('ru-RU', { timeZone, hour: '2-digit', minute: '2-digit' }),
  };
}

export type SlotFormats = ReturnType<typeof slotFormats>;

/** "чт, 19 ноября, 14:00–15:00". */
export function slotLabel(slot: Slot, formats: SlotFormats): string {
  const start = new Date(slot.start);
  return `${formats.day.format(start)}, ${formats.time.format(start)}–${formats.time.format(new Date(slot.end))}`;
}
