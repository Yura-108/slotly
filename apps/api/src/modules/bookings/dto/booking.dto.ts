import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import type { Booking } from '../bookings.service';

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

const instant = z.iso.datetime();

export const bookingResponseSchema = z
  .object({
    id: z.uuid(),
    status: z.enum(['pending', 'confirmed', 'rejected', 'cancelled', 'expired']),
    serviceName: z.string(),
    startAt: instant,
    endAt: instant,
    expiresAt: instant
      .nullable()
      .meta({ description: 'Pending only: when the request expires without an answer' }),
    specialist: z.object({ slug: z.string(), displayName: z.string() }),
  })
  .meta({ id: 'Booking' });
export class BookingResponseDto extends createZodDto(bookingResponseSchema) {}

export const toBookingResponse = (b: Booking): BookingResponseDto => ({
  ...b,
  startAt: b.startAt.toISOString(),
  endAt: b.endAt.toISOString(),
  expiresAt: b.expiresAt?.toISOString() ?? null,
});
