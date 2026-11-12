import { describe, expect, it } from 'vitest';
import { toLocalDateTime } from '../../../shared/zoned-time';
import { calculateSlots, type SlotQuery, type TimeRange } from './calculate-slots';

const at = (iso: string) => new Date(iso);
const hm = (h: number, m = 0) => h * 60 + m;
const range = (start: string, end: string): TimeRange => ({ start: at(start), end: at(end) });
const starts = (slots: TimeRange[]) => slots.map((s) => s.start.toISOString());

/** Defaults: Berlin, no notice, a long horizon; `now` is well before the range. */
function query(overrides: Partial<SlotQuery>): SlotQuery {
  return {
    timeZone: 'Europe/Berlin',
    intervals: [],
    daysOff: new Set(),
    busy: [],
    durationMinutes: 60,
    minNoticeMinutes: 0,
    bookingHorizonDays: 365,
    range: range('2026-11-16T00:00:00Z', '2026-11-17T00:00:00Z'),
    now: at('2026-11-01T00:00:00Z'),
    ...overrides,
  };
}

// 2026-11-16 is a Monday; Berlin is UTC+1 in November
const monday = (startMinute: number, endMinute: number) => ({
  weekday: 1,
  startMinute,
  endMinute,
});

describe('calculateSlots: grid', () => {
  it('steps by the service duration from the interval start; the last slot must fit', () => {
    const slots = calculateSlots(
      query({ intervals: [monday(hm(9), hm(12))], durationMinutes: 50 }),
    );
    expect(starts(slots)).toEqual([
      '2026-11-16T08:00:00.000Z',
      '2026-11-16T08:50:00.000Z',
      '2026-11-16T09:40:00.000Z', // 11:30–12:20 would not fit
    ]);
    expect(slots[0]?.end.toISOString()).toBe('2026-11-16T08:50:00.000Z');
  });

  it('starts a fresh grid in each interval of the day', () => {
    const slots = calculateSlots(
      query({ intervals: [monday(hm(13), hm(15)), monday(hm(9), hm(11))] }),
    );
    expect(starts(slots)).toEqual([
      '2026-11-16T08:00:00.000Z',
      '2026-11-16T09:00:00.000Z',
      '2026-11-16T12:00:00.000Z',
      '2026-11-16T13:00:00.000Z',
    ]);
  });

  it('applies rules by weekday of the local date', () => {
    const slots = calculateSlots(
      query({
        intervals: [
          { weekday: 1, startMinute: hm(10), endMinute: hm(11) },
          { weekday: 7, startMinute: hm(10), endMinute: hm(11) },
        ],
        range: range('2026-11-16T00:00:00Z', '2026-11-23T00:00:00Z'),
      }),
    );
    expect(starts(slots)).toEqual(['2026-11-16T09:00:00.000Z', '2026-11-22T09:00:00.000Z']);
  });

  it('uses the local date, not the UTC one', () => {
    // Monday 00:30 in Vladivostok (UTC+10) is still Sunday in UTC
    const slots = calculateSlots(
      query({
        timeZone: 'Asia/Vladivostok',
        intervals: [monday(hm(0, 30), hm(1, 30))],
        range: range('2026-11-15T00:00:00Z', '2026-11-17T00:00:00Z'),
      }),
    );
    expect(starts(slots)).toEqual(['2026-11-15T14:30:00.000Z']);
  });

  it('allows an interval until 24:00', () => {
    const slots = calculateSlots(query({ intervals: [monday(hm(22), 1440)] }));
    expect(starts(slots)).toEqual(['2026-11-16T21:00:00.000Z', '2026-11-16T22:00:00.000Z']);
  });
});

describe('calculateSlots: what removes slots', () => {
  const day = [monday(hm(9), hm(13))]; // 08:00Z … 12:00Z

  it('skips a whole day off', () => {
    const slots = calculateSlots(
      query({
        intervals: [...day, { weekday: 2, startMinute: hm(9), endMinute: hm(10) }],
        daysOff: new Set(['2026-11-16']),
        range: range('2026-11-16T00:00:00Z', '2026-11-18T00:00:00Z'),
      }),
    );
    expect(starts(slots)).toEqual(['2026-11-17T08:00:00.000Z']);
  });

  it('removes slots overlapping busy time without shifting the grid', () => {
    const slots = calculateSlots(
      query({
        intervals: day,
        busy: [
          // Touches 09:00 and 11:00 slots, overlaps none of them: half-open intervals
          range('2026-11-16T09:00:00Z', '2026-11-16T10:00:00Z'),
          // A short booking still takes the whole 11:00 slot
          range('2026-11-16T10:30:00Z', '2026-11-16T10:45:00Z'),
        ],
      }),
    );
    expect(starts(slots)).toEqual(['2026-11-16T08:00:00.000Z', '2026-11-16T11:00:00.000Z']);
  });

  it('keeps both neighbours of a booking: half-open intervals touch, not overlap', () => {
    // The booking takes exactly the 10:00 local slot (09:00Z–10:00Z)
    const slots = calculateSlots(
      query({ intervals: day, busy: [range('2026-11-16T09:00:00Z', '2026-11-16T10:00:00Z')] }),
    );
    expect(starts(slots)).toEqual([
      '2026-11-16T08:00:00.000Z', // ends when the booking starts
      '2026-11-16T10:00:00.000Z', // starts when the booking ends
      '2026-11-16T11:00:00.000Z',
    ]);
  });

  it('respects the minimum notice', () => {
    const slots = calculateSlots(
      query({ intervals: day, now: at('2026-11-16T07:30:00Z'), minNoticeMinutes: 60 }),
    );
    // Earliest start 08:30Z: the 09:00 local (08:00Z) slot is too soon
    expect(starts(slots)[0]).toBe('2026-11-16T09:00:00.000Z');
  });

  it('respects the booking horizon', () => {
    const slots = calculateSlots(
      query({ intervals: day, now: at('2026-11-15T10:00:00Z'), bookingHorizonDays: 1 }),
    );
    // Horizon ends 2026-11-16T10:00Z: a slot must start before it
    expect(starts(slots)).toEqual(['2026-11-16T08:00:00.000Z', '2026-11-16T09:00:00.000Z']);
  });

  it('returns only slots starting inside the requested range', () => {
    const slots = calculateSlots(
      query({ intervals: day, range: range('2026-11-16T09:00:00Z', '2026-11-16T11:00:00Z') }),
    );
    expect(starts(slots)).toEqual(['2026-11-16T09:00:00.000Z', '2026-11-16T10:00:00.000Z']);
  });

  it('returns nothing for a range entirely in the past', () => {
    const slots = calculateSlots(query({ intervals: day, now: at('2026-12-01T00:00:00Z') }));
    expect(slots).toEqual([]);
  });
});

describe('calculateSlots: daylight saving time (requirements §5)', () => {
  const sunday = (startMinute: number, endMinute: number) => [
    { weekday: 7, startMinute, endMinute },
  ];

  it('skips readings that do not exist on spring forward', () => {
    // Berlin, Sunday 2026-03-29: the clock jumps from 01:59 to 03:00
    const slots = calculateSlots(
      query({
        intervals: sunday(0, hm(6)),
        range: range('2026-03-28T00:00:00Z', '2026-03-30T00:00:00Z'),
        now: at('2026-03-01T00:00:00Z'),
      }),
    );
    expect(slots.map((s) => toLocalDateTime(s.start, 'Europe/Berlin').minute)).toEqual([
      hm(0),
      hm(1),
      hm(3),
      hm(4),
      hm(5),
    ]);
  });

  it('shows a repeated reading once on fall back (the earlier occurrence)', () => {
    // Berlin, Sunday 2026-10-25: 02:00–02:59 happens twice; 7 real hours, 6 slots
    const slots = calculateSlots(
      query({
        intervals: sunday(0, hm(6)),
        range: range('2026-10-24T00:00:00Z', '2026-10-26T00:00:00Z'),
        now: at('2026-10-01T00:00:00Z'),
      }),
    );
    expect(starts(slots)).toEqual([
      '2026-10-24T22:00:00.000Z',
      '2026-10-24T23:00:00.000Z',
      '2026-10-25T00:00:00.000Z', // 02:00 CEST; 02:00 CET (01:00Z) is not offered
      '2026-10-25T02:00:00.000Z',
      '2026-10-25T03:00:00.000Z',
      '2026-10-25T04:00:00.000Z',
    ]);
  });

  it('keeps slots disjoint when a gap shortens the day', () => {
    // 90 min: 01:30 CET runs until 04:00 CEST, so 03:00 CEST would overlap it
    const slots = calculateSlots(
      query({
        intervals: sunday(0, hm(6)),
        durationMinutes: 90,
        range: range('2026-03-28T00:00:00Z', '2026-03-30T00:00:00Z'),
        now: at('2026-03-01T00:00:00Z'),
      }),
    );
    expect(starts(slots)).toEqual([
      '2026-03-28T23:00:00.000Z', // 00:00 CET
      '2026-03-29T00:30:00.000Z', // 01:30 CET, ends 04:00 CEST
      '2026-03-29T02:30:00.000Z', // 04:30 CEST, ends 06:00
    ]);
  });

  it('ends the working time on the first occurrence of a repeated reading', () => {
    // Until 02:30 on 2026-10-25 means 02:30 CEST: the 02:00 CEST slot would run past it
    const slots = calculateSlots(
      query({
        intervals: sunday(0, hm(2, 30)),
        range: range('2026-10-24T00:00:00Z', '2026-10-26T00:00:00Z'),
        now: at('2026-10-01T00:00:00Z'),
      }),
    );
    expect(starts(slots)).toEqual(['2026-10-24T22:00:00.000Z', '2026-10-24T23:00:00.000Z']);
  });

  it('ends a day at the skipped midnight of a midnight transition', () => {
    // Santiago, Saturday 2026-09-05: after 23:59 comes 01:00 of September 6th
    const slots = calculateSlots(
      query({
        timeZone: 'America/Santiago',
        intervals: [{ weekday: 6, startMinute: hm(22), endMinute: 1440 }],
        range: range('2026-09-05T00:00:00Z', '2026-09-07T00:00:00Z'),
        now: at('2026-09-01T00:00:00Z'),
      }),
    );
    expect(starts(slots)).toEqual(['2026-09-06T02:00:00.000Z', '2026-09-06T03:00:00.000Z']);
  });

  it('ends the working time at a skipped reading: the clock jumps over it', () => {
    // Berlin 2026-03-29, until 02:30 (does not exist): 01:30 CET + 90 min ends at 04:00 CEST
    const slots = calculateSlots(
      query({
        intervals: sunday(0, hm(2, 30)),
        durationMinutes: 90,
        range: range('2026-03-28T00:00:00Z', '2026-03-30T00:00:00Z'),
        now: at('2026-03-01T00:00:00Z'),
      }),
    );
    expect(starts(slots)).toEqual(['2026-03-28T23:00:00.000Z']);
  });

  it('does not let a slot run past a skipped midnight into the next day', () => {
    // Santiago, Saturday 2026-09-05 until 24:00: 23:30 + 90 min ends at 02:00 of September 6th
    const slots = calculateSlots(
      query({
        timeZone: 'America/Santiago',
        intervals: [{ weekday: 6, startMinute: hm(22), endMinute: 1440 }],
        durationMinutes: 90,
        range: range('2026-09-05T00:00:00Z', '2026-09-07T00:00:00Z'),
        now: at('2026-09-01T00:00:00Z'),
      }),
    );
    expect(starts(slots)).toEqual(['2026-09-06T02:00:00.000Z']); // 22:00 only
  });

  it('keeps invariants for every day of a year in zones with and without DST', () => {
    for (const timeZone of ['Europe/Berlin', 'America/New_York', 'Australia/Lord_Howe']) {
      const slots = calculateSlots(
        query({
          timeZone,
          intervals: [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({
            weekday,
            startMinute: 0,
            endMinute: 1440,
          })),
          durationMinutes: 30,
          bookingHorizonDays: 400,
          range: range('2026-01-01T00:00:00Z', '2027-01-01T00:00:00Z'),
          now: at('2025-12-01T00:00:00Z'),
        }),
      );
      const readings = new Set<string>();
      for (const [i, slot] of slots.entries()) {
        expect(slot.end.getTime() - slot.start.getTime()).toBe(30 * 60_000);
        const previous = slots[i - 1];
        if (previous) expect(slot.start >= previous.end).toBe(true);
        const local = toLocalDateTime(slot.start, timeZone);
        expect(local.minute % 30).toBe(0);
        readings.add(`${local.date} ${local.minute}`);
      }
      // No reading is offered twice
      expect(readings.size).toBe(slots.length);
      // 48 per day; spring forward loses the skipped half-hours (Lord Howe skips 30 min,
      // the others an hour), fall back adds nothing. The UTC range cuts as many slots at
      // the start of the year as it adds at the end, so the count is exact.
      const skipped = timeZone === 'Australia/Lord_Howe' ? 1 : 2;
      expect(slots.length).toBe(365 * 48 - skipped);
    }
  });
});
