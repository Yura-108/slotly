/**
 * Date and time for people, in an explicit IANA zone (frontend.md §6). An explicit zone
 * makes server and browser output identical, so the result can be rendered anywhere.
 */

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string, kind: 'date' | 'time'): Intl.DateTimeFormat {
  const key = `${timeZone}|${kind}`;
  let f = formatters.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat(
      'ru-RU',
      kind === 'date'
        ? { timeZone, weekday: 'short', day: 'numeric', month: 'long' }
        : { timeZone, hour: '2-digit', minute: '2-digit' },
    );
    formatters.set(key, f);
  }
  return f;
}

/** "чт, 19 ноября, 14:00–15:00". */
export function formatTimeRange(start: string, end: string, timeZone: string): string {
  const s = new Date(start);
  return `${formatter(timeZone, 'date').format(s)}, ${formatter(timeZone, 'time').format(s)}–${formatter(timeZone, 'time').format(new Date(end))}`;
}

/** "чт, 19 ноября, 14:00". */
export function formatMoment(instant: string, timeZone: string): string {
  const d = new Date(instant);
  return `${formatter(timeZone, 'date').format(d)}, ${formatter(timeZone, 'time').format(d)}`;
}
