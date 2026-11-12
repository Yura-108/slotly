/**
 * Weekly schedule rules in the specialist's local wall-clock time (data-model.md).
 * A rule recurs on many dates with different UTC offsets (DST), so it has no single UTC
 * equivalent: it is converted per concrete date when slots are calculated (slice 5).
 */

export const MINUTES_PER_DAY = 1440;

/** ISO weekday: 1 = Monday … 7 = Sunday. */
export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface WeeklyInterval {
  weekday: Weekday;
  /** Minutes from local midnight, 0..1439. */
  startMinute: number;
  /** Minutes from local midnight, 1..1440 (1440 = end of day), > startMinute. */
  endMinute: number;
}

const TIME = /^([01]\d|2[0-4]):([0-5]\d)$/;

/** "10:30" → 630; "24:00" → 1440 (end of day). Null for anything else. */
export function parseTime(value: string): number | null {
  const match = TIME.exec(value);
  if (!match) return null;
  const minutes = Number(match[1]) * 60 + Number(match[2]);
  return minutes <= MINUTES_PER_DAY ? minutes : null;
}

/** 630 → "10:30"; 1440 → "24:00". */
export function formatTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Index pairs of intervals that overlap within the same weekday. Half-open intervals:
 * 10:00–12:00 and 12:00–14:00 touch but do not overlap, like the database range [).
 */
export function findOverlaps(intervals: readonly WeeklyInterval[]): [number, number][] {
  const overlaps: [number, number][] = [];
  // Stryker disable next-line EqualityOperator: an index past the end is skipped by the undefined check below
  for (let i = 0; i < intervals.length; i++) {
    // Stryker disable next-line EqualityOperator: as above
    for (let j = i + 1; j < intervals.length; j++) {
      const a = intervals[i];
      const b = intervals[j];
      if (!a || !b || a.weekday !== b.weekday) continue;
      if (a.startMinute < b.endMinute && b.startMinute < a.endMinute) overlaps.push([i, j]);
    }
  }
  return overlaps;
}

/** Stable order for storage and display: by weekday, then start. */
export function sortIntervals<T extends WeeklyInterval>(intervals: readonly T[]): T[] {
  return [...intervals].sort((a, b) => a.weekday - b.weekday || a.startMinute - b.startMinute);
}
