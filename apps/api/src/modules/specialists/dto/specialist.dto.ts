import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { isValidTimeZone } from '../../../shared/time-zone';

const slug = z
  .string()
  .regex(/^[a-z0-9-]{3,40}$/, {
    message: 'От 3 до 40 символов: латинские буквы в нижнем регистре, цифры и дефис',
  })
  .meta({ description: 'Public page address: /book/{slug}' });

const timezone = z
  .string()
  .refine(isValidTimeZone, { message: 'Неизвестный часовой пояс' })
  .meta({ description: 'IANA time zone in which the weekly schedule is interpreted' });

// Ranges mirror the database CHECKs (data-model.md: specialist_profiles)
const settings = {
  confirmationMode: z.enum(['auto', 'manual']),
  minNoticeMinutes: z.number().int().min(0).max(10080),
  bookingHorizonDays: z.number().int().min(1).max(365),
  clientCancelDeadlineHours: z.number().int().min(0).max(720),
};

const profileFields = {
  slug,
  displayName: z.string().trim().min(1).max(100),
  bio: z.string().trim().max(2000).nullable(),
  timezone,
};

export const enableSpecialistRequestSchema = z
  .object({
    slug: profileFields.slug,
    displayName: profileFields.displayName,
    bio: profileFields.bio.optional(),
    timezone: profileFields.timezone.optional(),
    confirmationMode: settings.confirmationMode.optional(),
    minNoticeMinutes: settings.minNoticeMinutes.optional(),
    bookingHorizonDays: settings.bookingHorizonDays.optional(),
    clientCancelDeadlineHours: settings.clientCancelDeadlineHours.optional(),
  })
  .meta({ id: 'EnableSpecialistRequest' });

export class EnableSpecialistRequestDto extends createZodDto(enableSpecialistRequestSchema) {}

export const updateSpecialistRequestSchema = z
  .object({ ...profileFields, ...settings })
  .partial()
  .refine((body) => Object.values(body).some((v) => v !== undefined), {
    message: 'Укажите хотя бы одно поле',
  })
  .meta({ id: 'UpdateSpecialistRequest' });

export class UpdateSpecialistRequestDto extends createZodDto(updateSpecialistRequestSchema) {}

export const specialistProfileResponseSchema = z
  .object({
    slug: z.string(),
    displayName: z.string(),
    bio: z.string().nullable(),
    timezone: z.string(),
    confirmationMode: settings.confirmationMode,
    minNoticeMinutes: z.number().int(),
    bookingHorizonDays: z.number().int(),
    clientCancelDeadlineHours: z.number().int(),
  })
  .meta({ id: 'SpecialistProfile' });

export class SpecialistProfileResponseDto extends createZodDto(specialistProfileResponseSchema) {}

/** What anyone may see: no booking settings beyond what a client needs. */
export const publicSpecialistResponseSchema = z
  .object({
    slug: z.string(),
    displayName: z.string(),
    bio: z.string().nullable(),
    timezone: z.string(),
  })
  .meta({ id: 'PublicSpecialist' });

export class PublicSpecialistResponseDto extends createZodDto(publicSpecialistResponseSchema) {}

export const slugParamsSchema = z.object({ slug: z.string().min(1).max(64) });
export class SlugParamsDto extends createZodDto(slugParamsSchema) {}
