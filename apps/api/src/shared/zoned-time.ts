/**
 * Wall-clock time in an IANA zone ↔ instants, without a date library.
 *
 * Instant → local time is a total function: every moment has exactly one reading on
 * the clock. Local time → instant is not: on the spring DST change a reading is skipped
 * (no instant), on the autumn change one is repeated (two instants). Callers decide what
 * to do with each case; nothing is shifted silently. Replace with native `Temporal`
 * once the runtime ships it unflagged (ROADMAP).
 */

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;

/** A calendar date "YYYY-MM-DD" and minutes since its local midnight (0..1439). */
export interface LocalDateTime {
  date: string;
  minute: number;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatters.set(timeZone, f);
  }
  return f;
}

/** The wall-clock reading at `instant`, as if that reading were a UTC timestamp (ms). */
function wallClockMs(instant: number, timeZone: string): number {
  const parts: Record<string, number> = {};
  for (const { type, value } of formatter(timeZone).formatToParts(instant)) {
    if (type !== 'literal') parts[type] = Number(value);
  }
  return Date.UTC(
    parts['year'] ?? 0,
    (parts['month'] ?? 1) - 1,
    parts['day'] ?? 1,
    parts['hour'] ?? 0,
    parts['minute'] ?? 0,
    parts['second'] ?? 0,
  );
}

/** Zone offset at `instant` in ms (Berlin in winter: +3 600 000). */
function offsetMs(instant: number, timeZone: string): number {
  return wallClockMs(instant, timeZone) - (instant - (((instant % 1000) + 1000) % 1000));
}

const pad = (n: number, width = 2) => String(n).padStart(width, '0');

function isoDate(utcMs: number): string {
  const d = new Date(utcMs);
  return `${pad(d.getUTCFullYear(), 4)}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

function dateMs(date: string): number {
  const [y = 0, m = 1, d = 1] = date.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

/** What the clock in `timeZone` shows at `instant`. */
export function toLocalDateTime(instant: Date, timeZone: string): LocalDateTime {
  const wall = wallClockMs(instant.getTime(), timeZone);
  const dayStart = Math.floor(wall / DAY_MS) * DAY_MS;
  return { date: isoDate(dayStart), minute: Math.floor((wall - dayStart) / MINUTE_MS) };
}

/**
 * Every instant at which the clock in `timeZone` shows `date` + `minute`, earliest first:
 * one normally, none for a skipped reading (spring forward), two for a repeated one
 * (fall back).
 *
 * Offsets a day before and after the reading cover both sides of a possible transition;
 * a candidate counts only if converting it back gives the same reading.
 */
export function resolveLocalTime(date: string, minute: number, timeZone: string): Date[] {
  const wall = dateMs(date) + minute * MINUTE_MS;
  const offsets = new Set([offsetMs(wall - DAY_MS, timeZone), offsetMs(wall + DAY_MS, timeZone)]);
  return [...offsets]
    .map((offset) => wall - offset)
    .filter((candidate) => wallClockMs(candidate, timeZone) === wall)
    .sort((a, b) => a - b)
    .map((ms) => new Date(ms));
}

/** "2026-01-31" + 1 → "2026-02-01". */
export function addDays(date: string, days: number): string {
  return isoDate(dateMs(date) + days * DAY_MS);
}

/** ISO weekday of a calendar date: 1 = Monday … 7 = Sunday. */
export function isoWeekday(date: string): number {
  const day = new Date(dateMs(date)).getUTCDay();
  return day === 0 ? 7 : day;
}
