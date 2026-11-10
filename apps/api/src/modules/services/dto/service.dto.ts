import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

// FR-20; mirrors the database CHECK services_duration_valid
const durationMinutes = z
  .number()
  .int()
  .min(15)
  .max(480)
  .multipleOf(5, { message: 'Длительность должна быть кратна 5 минутам' })
  .meta({ description: 'From 15 minutes to 8 hours, a multiple of 5' });

const fields = {
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(2000).nullable(),
  durationMinutes,
};

export const createServiceRequestSchema = z
  .object({ ...fields, description: fields.description.optional() })
  .meta({ id: 'CreateServiceRequest' });

export class CreateServiceRequestDto extends createZodDto(createServiceRequestSchema) {}

export const updateServiceRequestSchema = z
  .object(fields)
  .partial()
  .refine((body) => Object.values(body).some((v) => v !== undefined), {
    message: 'Укажите хотя бы одно поле',
  })
  .meta({ id: 'UpdateServiceRequest' });

export class UpdateServiceRequestDto extends createZodDto(updateServiceRequestSchema) {}

const serviceSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  description: z.string().nullable(),
  durationMinutes: z.number().int(),
});

export const myServiceResponseSchema = serviceSchema
  .extend({ archived: z.boolean() })
  .meta({ id: 'MyService' });

export class MyServiceResponseDto extends createZodDto(myServiceResponseSchema) {}

// Short lists (a specialist has a handful of services): no pagination, but the
// { items, total } envelope of api.md §1, so pagination can be added without a breaking change
export const myServiceListResponseSchema = z
  .object({ items: z.array(myServiceResponseSchema), total: z.number().int() })
  .meta({ id: 'MyServiceList' });

export class MyServiceListResponseDto extends createZodDto(myServiceListResponseSchema) {}

export const publicServiceListResponseSchema = z
  .object({ items: z.array(serviceSchema.meta({ id: 'PublicService' })), total: z.number().int() })
  .meta({ id: 'PublicServiceList' });

export class PublicServiceListResponseDto extends createZodDto(publicServiceListResponseSchema) {}

export const serviceIdParamsSchema = z.object({ id: z.uuid() });
export class ServiceIdParamsDto extends createZodDto(serviceIdParamsSchema) {}
