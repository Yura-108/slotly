/**
 * True for IANA time zone names the runtime knows (e.g. `Europe/Moscow`, `UTC`).
 * `Intl.supportedValuesOf('timeZone')` omits aliases such as `UTC`, so we ask the formatter.
 */
export function isValidTimeZone(timeZone: string): boolean {
  if (timeZone.length === 0 || timeZone.length > 64) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}
