import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { isValidIsoDate } from '../domain/local-date';
import {
  findOverlaps,
  formatTime,
  parseTime,
  type Weekday,
  type WeeklyInterval,
} from '../domain/weekly-schedule';

const time = z
  .string()
  .refine((v) => parseTime(v) !== null, { message: 'Время в формате ЧЧ:ММ, от 00:00 до 24:00' })
  .meta({ description: 'Local time HH:MM; 24:00 = end of day', example: '10:00' });

const intervalSchema = z
  .object({
    weekday: z.number().int().min(1).max(7).meta({ description: 'ISO weekday: 1 = Monday' }),
    start: time,
    end: time,
  })
  .refine((i) => (parseTime(i.end) ?? 0) > (parseTime(i.start) ?? 0), {
    message: 'Конец интервала должен быть позже начала',
    path: ['end'],
  });

const toInterval = (i: z.infer<typeof intervalSchema>): WeeklyInterval => ({
  weekday: i.weekday as Weekday,
  startMinute: parseTime(i.start) ?? 0,
  endMinute: parseTime(i.end) ?? 0,
});

/**
 * The whole week. Overlaps make the request self-contradictory, so they are a 400 with
 * the path of the offending interval — the UI highlights the exact row.
 */
export const weeklyScheduleRequestSchema = z
  .object({ intervals: z.array(intervalSchema).max(70) })
  .superRefine((body, ctx) => {
    const intervals = body.intervals.map(toInterval);
    for (const [, second] of findOverlaps(intervals)) {
      ctx.addIssue({
        code: 'custom',
        path: ['intervals', second],
        message: 'Интервал пересекается с другим интервалом этого дня',
      });
    }
  })
  .meta({ id: 'WeeklyScheduleRequest' });

export class WeeklyScheduleRequestDto extends createZodDto(weeklyScheduleRequestSchema) {}

export function toWeeklyIntervals(body: WeeklyScheduleRequestDto): WeeklyInterval[] {
  return body.intervals.map(toInterval);
}

const intervalResponseSchema = z.object({
  weekday: z.number().int(),
  start: z.string(),
  end: z.string(),
});

export const weeklyScheduleResponseSchema = z
  .object({
    timezone: z.string().meta({ description: 'IANA zone the intervals are interpreted in' }),
    intervals: z.array(intervalResponseSchema),
  })
  .meta({ id: 'WeeklySchedule' });

export class WeeklyScheduleResponseDto extends createZodDto(weeklyScheduleResponseSchema) {}

export function toWeeklyScheduleResponse(schedule: {
  timezone: string;
  intervals: WeeklyInterval[];
}): WeeklyScheduleResponseDto {
  return {
    timezone: schedule.timezone,
    intervals: schedule.intervals.map((i) => ({
      weekday: i.weekday,
      start: formatTime(i.startMinute),
      end: formatTime(i.endMinute),
    })),
  };
}

const isoDate = z
  .string()
  .refine(isValidIsoDate, { message: 'Дата в формате ГГГГ-ММ-ДД' })
  .meta({ description: "Local date in the specialist's time zone", example: '2026-12-31' });

export const addDayOffRequestSchema = z.object({ date: isoDate }).meta({ id: 'AddDayOffRequest' });
export class AddDayOffRequestDto extends createZodDto(addDayOffRequestSchema) {}

const dayOffSchema = z.object({ id: z.uuid(), date: z.string() }).meta({ id: 'DayOff' });
export class DayOffResponseDto extends createZodDto(dayOffSchema) {}

export const dayOffListResponseSchema = z
  .object({ items: z.array(dayOffSchema), total: z.number().int() })
  .meta({ id: 'DayOffList' });
export class DayOffListResponseDto extends createZodDto(dayOffListResponseSchema) {}

export const dayOffIdParamsSchema = z.object({ id: z.uuid() });
export class DayOffIdParamsDto extends createZodDto(dayOffIdParamsSchema) {}
