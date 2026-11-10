import 'server-only';

/**
 * Time zones for a <select>, computed on the server: the API runs on the same Node.js, so
 * every zone offered is one it accepts, and server and browser render the same list (no
 * hydration mismatch from different ICU versions). UTC is an alias supportedValuesOf omits.
 */
export function availableTimeZones(current?: string): string[] {
  const zones = new Set(['UTC', ...Intl.supportedValuesOf('timeZone')]);
  if (current) zones.add(current);
  return [...zones].sort();
}
