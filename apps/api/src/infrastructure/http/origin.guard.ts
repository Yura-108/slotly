import { type CanActivate, type ExecutionContext, Injectable, Logger } from '@nestjs/common';
import type { Request } from 'express';
import { ForbiddenError } from '../../shared/domain-error';
import { AppConfig } from '../config/config.schema';

export class OriginNotAllowedError extends ForbiddenError {
  readonly code = 'ORIGIN_NOT_ALLOWED';

  constructor() {
    super('Запрос отклонён: он отправлен не со страницы Slotly.');
  }
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * CSRF protection together with SameSite=Lax (ADR-005): a state-changing request must
 * come from our web origin. Browsers always send Origin with fetch POST/PUT/PATCH/DELETE,
 * so a missing header means the request did not come from our UI and is rejected too.
 */
@Injectable()
export class OriginGuard implements CanActivate {
  private readonly logger = new Logger(OriginGuard.name);

  constructor(private readonly config: AppConfig) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    if (SAFE_METHODS.has(request.method)) return true;
    if (request.headers.origin === this.config.appOrigin) return true;

    this.logger.warn(
      { origin: request.headers.origin ?? null, method: request.method },
      'Origin rejected',
    );
    throw new OriginNotAllowedError();
  }
}
