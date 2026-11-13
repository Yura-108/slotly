import { type ArgumentsHost, Catch, type ExceptionFilter, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';
import { toProblemDetails } from './problem-details';

/** Seconds a client should wait before retrying a 503. */
const RETRY_AFTER_S = 30;

/** Global filter: every error leaves the API as `application/problem+json` (ADR-007). */
@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  private readonly logger = new Logger(ProblemDetailsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const body = toProblemDetails(exception);

    if (body.status === 503) {
      // Expected during an outage: one line per request, not a stack trace each
      this.logger.warn({ err: exception }, 'Database unavailable');
      response.setHeader('Retry-After', RETRY_AFTER_S);
    } else if (body.status >= 500) {
      this.logger.error({ err: exception }, 'Unhandled error');
    } else if (body.status === 429) {
      this.logger.warn({ ip: request.ip }, 'Rate limit exceeded');
    }

    // pino-http types the id loosely; ours is always a UUID string (logging.module.ts)
    const requestId = typeof request.id === 'string' ? request.id : undefined;
    response
      .status(body.status)
      .type('application/problem+json')
      .json({ ...body, requestId });
  }
}
