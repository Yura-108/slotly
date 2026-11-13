import { HttpException, HttpStatus } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { createZodDto, ZodSerializationException, ZodValidationException } from 'nestjs-zod';
import { z } from 'zod';
import {
  BusinessRuleError,
  ConflictError,
  DomainError,
  ForbiddenError,
  NotFoundError,
  UnauthenticatedError,
} from '../../shared/domain-error';
import { isDatabaseUnavailable } from '../database/pg-errors';

/** RFC 9457 Problem Details with our extensions `code`, `requestId`, `errors` (api.md §3). */
export const problemDetailsSchema = z
  .object({
    type: z.string(),
    title: z.string(),
    status: z.number().int(),
    code: z.string().meta({ description: 'Stable machine-readable code; clients branch on it' }),
    detail: z.string(),
    requestId: z.string().optional(),
    errors: z
      .array(z.object({ path: z.string(), code: z.string(), message: z.string() }))
      .optional()
      .meta({ description: 'Field errors, only for VALIDATION_FAILED' }),
  })
  .meta({ id: 'ProblemDetails' });

export type ProblemDetails = z.infer<typeof problemDetailsSchema>;
export class ProblemDetailsDto extends createZodDto(problemDetailsSchema) {}

const TITLES: Partial<Record<number, string>> = {
  400: 'Некорректный запрос',
  401: 'Требуется вход',
  403: 'Доступ запрещён',
  404: 'Не найдено',
  409: 'Конфликт',
  413: 'Слишком большой запрос',
  422: 'Действие невозможно',
  429: 'Слишком много запросов',
  500: 'Внутренняя ошибка',
  503: 'Сервис временно недоступен',
};

/** Codes for framework-level HTTP errors that do not come from our domain. */
const HTTP_CODES: Partial<Record<number, string>> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHENTICATED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  405: 'METHOD_NOT_ALLOWED',
  413: 'PAYLOAD_TOO_LARGE',
  415: 'UNSUPPORTED_MEDIA_TYPE',
};

function statusOf(error: DomainError): number {
  if (error instanceof UnauthenticatedError) return HttpStatus.UNAUTHORIZED;
  if (error instanceof ForbiddenError) return HttpStatus.FORBIDDEN;
  if (error instanceof NotFoundError) return HttpStatus.NOT_FOUND;
  if (error instanceof ConflictError) return HttpStatus.CONFLICT;
  if (error instanceof BusinessRuleError) return HttpStatus.UNPROCESSABLE_ENTITY;
  // A DomainError without a category is a programming error: never leak it as a 4xx
  return HttpStatus.INTERNAL_SERVER_ERROR;
}

function problem(status: number, code: string, detail: string): ProblemDetails {
  return {
    type: `https://slotly.app/errors/${code.toLowerCase().replaceAll('_', '-')}`,
    title: TITLES[status] ?? 'Ошибка',
    status,
    code,
    detail,
  };
}

const INTERNAL = (): ProblemDetails =>
  problem(500, 'INTERNAL_ERROR', 'Что-то пошло не так. Попробуйте ещё раз.');

/**
 * A client error raised by Express middleware before Nest sees the request (body-parser:
 * body too large, unsupported charset). They come from http-errors, which marks errors
 * that are safe to report with `expose`.
 */
function clientErrorStatus(exception: unknown): number | undefined {
  if (!(exception instanceof Error)) return undefined;
  const { status, expose } = exception as { status?: unknown; expose?: unknown };
  return expose === true && typeof status === 'number' && status >= 400 && status < 500
    ? status
    : undefined;
}

const UNAVAILABLE = (): ProblemDetails =>
  problem(503, 'SERVICE_UNAVAILABLE', 'Сервис временно недоступен. Попробуйте через минуту.');

/**
 * Maps any thrown value to Problem Details. The only place where errors become HTTP
 * (CLAUDE.md rule 8). Pure, so every mapping is unit-tested without a server.
 * 5xx never carry internal messages: the cause goes to the logs, not to the client.
 */
export function toProblemDetails(exception: unknown): ProblemDetails {
  if (exception instanceof DomainError) {
    const status = statusOf(exception);
    return status === 500 ? INTERNAL() : problem(status, exception.code, exception.message);
  }

  if (exception instanceof ZodValidationException) {
    const zodError = exception.getZodError();
    const issues = zodError instanceof z.ZodError ? zodError.issues : [];
    return {
      ...problem(400, 'VALIDATION_FAILED', 'Проверьте правильность заполнения полей.'),
      errors: issues.map((issue) => ({
        path: issue.path.map(String).join('.'),
        code: issue.code,
        message: issue.message,
      })),
    };
  }

  // The response did not match its declared schema: our bug, not the client's
  if (exception instanceof ZodSerializationException) return INTERNAL();

  if (exception instanceof ThrottlerException) {
    return problem(429, 'RATE_LIMITED', 'Слишком много попыток. Подождите и попробуйте снова.');
  }

  // The database is down or overloaded: a fast, retryable answer instead of 500 (ADR-016)
  if (isDatabaseUnavailable(exception)) return UNAVAILABLE();

  if (exception instanceof HttpException) {
    const status = exception.getStatus();
    if (status === 503) return UNAVAILABLE();
    if (status >= 500) return INTERNAL();
    return problem(status, HTTP_CODES[status] ?? 'HTTP_ERROR', 'Запрос не может быть выполнен.');
  }

  const clientStatus = clientErrorStatus(exception);
  if (clientStatus !== undefined) {
    return problem(
      clientStatus,
      HTTP_CODES[clientStatus] ?? 'HTTP_ERROR',
      'Запрос не может быть выполнен.',
    );
  }

  return INTERNAL();
}
