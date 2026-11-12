/**
 * The calendar date ("YYYY-MM-DD") at instant `now` in an IANA time zone. When it is
 * already January 1st in Moscow, it is still December 31st in UTC — "today" depends on
 * whose clock. Pure: `now` is a parameter (ADR-006).
 */
export function localDate(now: Date, timeZone: string): string {
  // en-CA formats dates as YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/** ISO dates compare correctly as strings. */
export function isPastDate(date: string, now: Date, timeZone: string): boolean {
  return date < localDate(now, timeZone);
}

/** A real calendar date in YYYY-MM-DD form (rejects 2026-02-30). */
export function isValidIsoDate(value: string): boolean {
  // Stryker disable next-line ConditionalExpression,Regex: the round trip below rejects the same strings; the pattern states the expected format
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value);
}
