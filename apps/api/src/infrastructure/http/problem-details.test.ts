import {
  BadRequestException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { ZodSerializationException, ZodValidationException } from 'nestjs-zod';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { BookingConflictError } from '../../modules/bookings/domain/errors';
import { BusinessRuleError, DomainError } from '../../shared/domain-error';
import { toProblemDetails } from './problem-details';

class CancelDeadlinePassedError extends BusinessRuleError {
  readonly code = 'CANCEL_DEADLINE_PASSED';
}

class UncategorizedError extends DomainError {
  readonly code = 'SECRET_INTERNAL_STATE';
}

describe('toProblemDetails', () => {
  it('maps a conflict to 409 with its code and user-facing detail', () => {
    expect(toProblemDetails(new BookingConflictError())).toEqual({
      type: 'https://slotly.app/errors/booking-slot-taken',
      title: 'Конфликт',
      status: 409,
      code: 'BOOKING_SLOT_TAKEN',
      detail: 'Выбранное время только что забронировали. Выберите другой слот.',
    });
  });

  it('maps a business rule to 422', () => {
    const problem = toProblemDetails(new CancelDeadlinePassedError('Срок отмены прошёл.'));
    expect(problem).toMatchObject({ status: 422, code: 'CANCEL_DEADLINE_PASSED' });
  });

  it('turns Zod issues into field errors', () => {
    const result = z.object({ email: z.email() }).safeParse({ email: 'nope' });
    if (result.success) throw new Error('expected a validation error');
    const problem = toProblemDetails(new ZodValidationException(result.error));
    expect(problem).toMatchObject({ status: 400, code: 'VALIDATION_FAILED' });
    expect(problem.errors).toEqual([
      { path: 'email', code: 'invalid_format', message: expect.any(String) as string },
    ]);
  });

  it('reports rate limiting as 429 RATE_LIMITED', () => {
    expect(toProblemDetails(new ThrottlerException())).toMatchObject({
      status: 429,
      code: 'RATE_LIMITED',
    });
  });

  it('keeps framework 4xx statuses with a generic code', () => {
    expect(toProblemDetails(new NotFoundException())).toMatchObject({
      status: 404,
      code: 'NOT_FOUND',
    });
    expect(toProblemDetails(new BadRequestException('Unexpected token } in JSON'))).toMatchObject({
      status: 400,
      code: 'BAD_REQUEST',
      detail: 'Запрос не может быть выполнен.',
    });
  });

  it('never leaks internals of unknown errors, serialization bugs or uncategorized domain errors', () => {
    const internal = { status: 500, code: 'INTERNAL_ERROR' };
    expect(toProblemDetails(new Error('connection to 10.0.0.5 refused'))).toMatchObject(internal);
    expect(toProblemDetails(new ZodSerializationException(new z.ZodError([])))).toMatchObject(
      internal,
    );
    const problem = toProblemDetails(new UncategorizedError('table users is locked'));
    expect(problem).toMatchObject(internal);
    expect(JSON.stringify(problem)).not.toMatch(/users|SECRET/);
  });

  it('reports client errors of Express middleware (body-parser) with their 4xx status', () => {
    const tooLarge = Object.assign(new Error('request entity too large'), {
      status: 413,
      expose: true,
      type: 'entity.too.large',
    });
    expect(toProblemDetails(tooLarge)).toMatchObject({
      status: 413,
      code: 'PAYLOAD_TOO_LARGE',
      detail: 'Запрос не может быть выполнен.',
    });
    // Not marked safe to expose, or not a client error: stays an opaque 500
    const hidden = Object.assign(new Error('x'), { status: 413 });
    const server = Object.assign(new Error('x'), { status: 502, expose: true });
    expect(toProblemDetails(hidden)).toMatchObject({ status: 500 });
    expect(toProblemDetails(server)).toMatchObject({ status: 500 });
  });

  it('answers an unavailable database with 503 that reveals nothing about it', () => {
    const refused = Object.assign(new Error('connect ECONNREFUSED 10.0.0.5:5432'), {
      code: 'ECONNREFUSED',
    });
    const problem = toProblemDetails(new Error('Failed query: select …', { cause: refused }));
    expect(problem).toEqual({
      type: 'https://slotly.app/errors/service-unavailable',
      title: 'Сервис временно недоступен',
      status: 503,
      code: 'SERVICE_UNAVAILABLE',
      detail: 'Сервис временно недоступен. Попробуйте через минуту.',
    });
    expect(toProblemDetails(new ServiceUnavailableException('pool drained'))).toEqual(problem);
  });
});
