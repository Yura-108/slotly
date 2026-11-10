import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { isValidTimeZone } from '../../../shared/time-zone';

export const meResponseSchema = z
  .object({
    id: z.uuid(),
    email: z.email(),
    name: z.string(),
    timezone: z.string().meta({ description: 'IANA time zone, e.g. Europe/Moscow' }),
    emailVerified: z.boolean(),
  })
  .meta({ id: 'Me' });

export class MeResponseDto extends createZodDto(meResponseSchema) {}

export const updateMeRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    timezone: z
      .string()
      .refine(isValidTimeZone, { message: 'Неизвестный часовой пояс' })
      .optional()
      .meta({ description: 'IANA time zone, e.g. Europe/Moscow' }),
  })
  .refine((body) => body.name !== undefined || body.timezone !== undefined, {
    message: 'Укажите хотя бы одно поле',
  })
  .meta({ id: 'UpdateMeRequest' });

export class UpdateMeRequestDto extends createZodDto(updateMeRequestSchema) {}
