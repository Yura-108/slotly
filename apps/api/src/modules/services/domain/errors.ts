import { BusinessRuleError, NotFoundError } from '../../../shared/domain-error';

/** Also for someone else's service: it must look like it does not exist (requirements §2). */
export class ServiceNotFoundError extends NotFoundError {
  readonly code = 'NOT_FOUND';

  constructor() {
    super('Услуга не найдена.');
  }
}

/** FR-21: an archived service is kept for existing bookings, not edited. */
export class ServiceArchivedError extends BusinessRuleError {
  readonly code = 'SERVICE_ARCHIVED';

  constructor() {
    super('Услуга в архиве, её нельзя изменить.');
  }
}
