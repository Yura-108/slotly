import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { isValidTimeZone } from '../../../shared/time-zone';

// Normalization to lower case is a domain rule (users/domain/email.ts); here only the format
const email = z.string().trim().max(254).pipe(z.email());

// Length is the policy (NIST SP 800-63B); the upper bound limits hashing cost per request
const newPassword = z.string().min(8).max(128);

// base64url of 32 random bytes; a looser bound keeps the error uniform for bad links
const emailToken = z.string().min(16).max(128);

export const registerRequestSchema = z
  .object({
    email,
    password: newPassword,
    name: z.string().trim().min(1).max(100),
    timezone: z
      .string()
      .refine(isValidTimeZone, { message: 'Неизвестный часовой пояс' })
      .meta({ description: 'IANA time zone of the browser, e.g. Europe/Moscow' }),
  })
  .meta({ id: 'RegisterRequest' });

export class RegisterRequestDto extends createZodDto(registerRequestSchema) {}

export const loginRequestSchema = z
  .object({
    email,
    // No length policy at login: it would leak the rules and reject old valid passwords
    password: z.string().min(1).max(128),
  })
  .meta({ id: 'LoginRequest' });

export class LoginRequestDto extends createZodDto(loginRequestSchema) {}

export const verifyEmailRequestSchema = z
  .object({ token: emailToken })
  .meta({ id: 'VerifyEmailRequest' });

export class VerifyEmailRequestDto extends createZodDto(verifyEmailRequestSchema) {}

export const passwordResetRequestSchema = z.object({ email }).meta({ id: 'PasswordResetRequest' });

export class PasswordResetRequestDto extends createZodDto(passwordResetRequestSchema) {}

export const passwordResetConfirmSchema = z
  .object({ token: emailToken, password: newPassword })
  .meta({ id: 'PasswordResetConfirm' });

export class PasswordResetConfirmDto extends createZodDto(passwordResetConfirmSchema) {}
