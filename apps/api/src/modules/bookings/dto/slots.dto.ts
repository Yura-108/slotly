import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

/** Upper bound of one request: a month view; also caps the work per request (NFR 6.2). */
export const MAX_SLOT_RANGE_DAYS = 31;
const DAY_MS = 24 * 60 * 60 * 1000;

export const slotsParamsSchema = z.object({ slug: z.string().min(1).max(64) });
export class SlotsParamsDto extends createZodDto(slotsParamsSchema) {}

const instant = (description: string) =>
  z.iso.datetime({ offset: true }).meta({ description, example: '2026-11-16T00:00:00+03:00' });

/**
 * Instants, not dates: "Friday" starts at different moments for a client in Vladivostok
 * and a specialist in Berlin. The client sends the bounds of its own local days.
 */
export const slotsQuerySchema = z
  .object({
    serviceId: z.uuid(),
    from: instant('Range start, inclusive (ISO 8601 with offset)'),
    to: instant('Range end, exclusive (ISO 8601 with offset)'),
  })
  .refine((q) => Date.parse(q.to) > Date.parse(q.from), {
    message: 'Конец диапазона должен быть позже начала',
    path: ['to'],
  })
  .refine((q) => Date.parse(q.to) - Date.parse(q.from) <= MAX_SLOT_RANGE_DAYS * DAY_MS, {
    message: `Диапазон — не больше ${MAX_SLOT_RANGE_DAYS} дней`,
    path: ['to'],
  });
export class SlotsQueryDto extends createZodDto(slotsQuerySchema) {}

const slotSchema = z
  .object({
    start: z.iso.datetime().meta({ description: 'UTC; display in the viewer time zone' }),
    end: z.iso.datetime(),
  })
  .meta({ id: 'Slot' });

export const slotListResponseSchema = z
  .object({ items: z.array(slotSchema), total: z.number().int() })
  .meta({ id: 'SlotList' });
export class SlotListResponseDto extends createZodDto(slotListResponseSchema) {}
