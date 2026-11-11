import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import type { BookingView } from '../bookings.service';

const STATUSES = ['pending', 'confirmed', 'rejected', 'cancelled', 'expired'] as const;
const PARTIES = ['client', 'specialist'] as const;

export const createBookingRequestSchema = z
  .object({
    serviceId: z.uuid(),
    startAt: z.iso.datetime({ offset: true }).meta({
      description: 'Slot start exactly as returned by GET /specialists/{slug}/slots',
      example: '2026-11-19T11:00:00.000Z',
    }),
  })
  .meta({ id: 'CreateBookingRequest' });
export class CreateBookingRequestDto extends createZodDto(createBookingRequestSchema) {}

/** Optional explanation for the other party; blank means none. */
export const bookingReasonRequestSchema = z
  .object({
    reason: z
      .string()
      .trim()
      .max(500)
      .optional()
      .transform((v) => (v ? v : null)),
  })
  .meta({ id: 'BookingReasonRequest' });
export class BookingReasonRequestDto extends createZodDto(bookingReasonRequestSchema) {}

export const bookingIdParamsSchema = z.object({ id: z.uuid() });
export class BookingIdParamsDto extends createZodDto(bookingIdParamsSchema) {}

export const bookingListQuerySchema = z.object({
  as: z.enum(PARTIES).default('client').meta({ description: 'Bookings I made, or made to me' }),
  scope: z.enum(['upcoming', 'past']).default('upcoming'),
  status: z
    .enum(STATUSES)
    .optional()
    .meta({ description: 'Effective status: an overdue request counts as expired' }),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});
export class BookingListQueryDto extends createZodDto(bookingListQuerySchema) {}

const instant = z.iso.datetime();

export const bookingResponseSchema = z
  .object({
    id: z.uuid(),
    status: z.enum(STATUSES).meta({ description: 'Effective status' }),
    serviceName: z.string(),
    startAt: instant,
    endAt: instant,
    expiresAt: instant
      .nullable()
      .meta({ description: 'Pending only: when the request expires without an answer' }),
    cancelDeadlineAt: instant.meta({
      description: 'The client may cancel a confirmed booking until then (fixed at booking time)',
    }),
    cancelledBy: z.enum(PARTIES).nullable(),
    statusReason: z.string().nullable(),
    party: z.enum(PARTIES).meta({ description: "The viewer's side of the booking" }),
    specialist: z.object({ slug: z.string(), displayName: z.string() }),
    client: z.object({ name: z.string() }),
    allowedActions: z
      .array(z.enum(['confirm', 'reject', 'cancel']))
      .meta({ description: 'What the viewer can do now; the UI shows only these (ADR-009)' }),
  })
  .meta({ id: 'Booking' });
export class BookingResponseDto extends createZodDto(bookingResponseSchema) {}

export const bookingListResponseSchema = z
  .object({ items: z.array(bookingResponseSchema), total: z.number().int() })
  .meta({ id: 'BookingList' });
export class BookingListResponseDto extends createZodDto(bookingListResponseSchema) {}

export const toBookingResponse = (b: BookingView): BookingResponseDto => ({
  ...b,
  startAt: b.startAt.toISOString(),
  endAt: b.endAt.toISOString(),
  expiresAt: b.expiresAt?.toISOString() ?? null,
  cancelDeadlineAt: b.cancelDeadlineAt.toISOString(),
});
