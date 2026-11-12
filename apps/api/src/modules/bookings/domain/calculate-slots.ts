import { addDays, isoWeekday, resolveLocalTime, toLocalDateTime } from '../../../shared/zoned-time';

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;

/** A half-open interval of time [start, end). */
export interface TimeRange {
  start: Date;
  end: Date;
}

/** A weekly working interval in the specialist's wall-clock time (scheduling module). */
export interface WorkingInterval {
  /** ISO: 1 = Monday … 7 = Sunday. */
  weekday: number;
  /** Minutes from local midnight. */
  startMinute: number;
  /** Minutes from local midnight; 1440 = end of day. */
  endMinute: number;
}

export interface SlotQuery {
  /** IANA zone the rules and days off are written in. */
  timeZone: string;
  intervals: readonly WorkingInterval[];
  /** Local dates "YYYY-MM-DD" with no work at all. */
  daysOff: ReadonlySet<string>;
  /** Time taken by active bookings (any order). */
  busy: readonly TimeRange[];
  durationMinutes: number;
  minNoticeMinutes: number;
  bookingHorizonDays: number;
  /** Return slots starting in [range.start, range.end). */
  range: TimeRange;
  now: Date;
}

const overlaps = (a: TimeRange, b: TimeRange) => a.start < b.end && b.start < a.end;

/**
 * Free slots for one service (requirements FR-41–43), sorted, in UTC.
 *
 * The grid lives in the specialist's wall-clock time: starts at the beginning of each
 * working interval with step = service duration (FR-42), so slots stay at 10:00, 11:00…
 * whatever the UTC offset of the date. Each start is then resolved to an instant:
 * - a reading skipped by spring forward has no instant → no slot;
 * - a reading repeated by fall back → its first occurrence only, so no duplicates (§5);
 * - the slot must end by the interval end as the clock shows it at that moment, so the
 *   specialist works the hours written in the schedule, by their clock;
 * - grid slots never overlap each other (possible when a gap shortens the day).
 * The grid depends on the rules only; days off, bookings, notice and horizon then
 * remove slots from it without shifting the rest.
 */
export function calculateSlots(q: SlotQuery): TimeRange[] {
  const durationMs = q.durationMinutes * MINUTE_MS;
  const earliest = Math.max(
    q.range.start.getTime(),
    q.now.getTime() + q.minNoticeMinutes * MINUTE_MS,
  );
  const latest = Math.min(q.range.end.getTime(), q.now.getTime() + q.bookingHorizonDays * DAY_MS);

  const slots: TimeRange[] = [];
  const lastDate = toLocalDateTime(new Date(latest), q.timeZone).date;
  for (
    let date = toLocalDateTime(new Date(earliest), q.timeZone).date;
    date <= lastDate;
    date = addDays(date, 1)
  ) {
    if (q.daysOff.has(date)) continue;
    const weekday = isoWeekday(date);
    const intervals = q.intervals
      .filter((i) => i.weekday === weekday)
      .sort((a, b) => a.startMinute - b.startMinute);

    let previousEnd = -Infinity;
    for (const interval of intervals) {
      const fitsInterval = intervalEndCheck(date, interval.endMinute, q.timeZone);
      // Stryker disable next-line EqualityOperator: a slot starting at the interval end never fits it
      for (let minute = interval.startMinute; minute < interval.endMinute;) {
        const [first] = resolveLocalTime(date, minute, q.timeZone);
        minute += q.durationMinutes;
        if (!first) continue;

        const slot = { start: first, end: new Date(first.getTime() + durationMs) };
        if (!fitsInterval(slot.end)) continue;
        if (slot.start.getTime() < previousEnd) continue;
        previousEnd = slot.end.getTime();

        const start = slot.start.getTime();
        if (start < earliest || start >= latest) continue;
        if (q.busy.some((b) => overlaps(slot, b))) continue;
        slots.push(slot);
      }
    }
  }
  return slots;
}

/**
 * Whether a slot ending at a given instant fits a working interval ending at `endMinute`
 * of `date` (1440, i.e. 24:00, resolves to the next midnight). The interval ends when the
 * clock first shows that reading. If spring forward skips the reading, the clock jumps over it: the slot
 * fits when its last minute is still before the reading on the same date.
 */
function intervalEndCheck(
  date: string,
  endMinute: number,
  timeZone: string,
): (slotEnd: Date) => boolean {
  const [intervalEnd] = resolveLocalTime(date, endMinute, timeZone);
  if (intervalEnd) return (slotEnd) => slotEnd <= intervalEnd;
  return (slotEnd) => {
    const last = toLocalDateTime(new Date(slotEnd.getTime() - MINUTE_MS), timeZone);
    // Stryker disable next-line EqualityOperator: endMinute is a skipped reading here, the clock never shows it
    return last.date === date && last.minute < endMinute;
  };
}
