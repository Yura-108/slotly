import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

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
