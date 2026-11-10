import { ConflictError, ForbiddenError, NotFoundError } from '../../../shared/domain-error';

/** FR-2: an unconfirmed email cannot open a public specialist page. */
export class EmailNotVerifiedError extends ForbiddenError {
  readonly code = 'EMAIL_NOT_VERIFIED';

  constructor() {
    super('Подтвердите email, чтобы включить профиль специалиста.');
  }
}

export class SpecialistProfileRequiredError extends ForbiddenError {
  readonly code = 'SPECIALIST_PROFILE_REQUIRED';

  constructor() {
    super('Сначала включите профиль специалиста.');
  }
}

export class SpecialistProfileExistsError extends ConflictError {
  readonly code = 'SPECIALIST_PROFILE_EXISTS';

  constructor() {
    super('Профиль специалиста уже включён.');
  }
}

export class SlugTakenError extends ConflictError {
  readonly code = 'SLUG_TAKEN';

  constructor() {
    super('Этот адрес страницы уже занят. Выберите другой.');
  }
}

export class SpecialistNotFoundError extends NotFoundError {
  readonly code = 'NOT_FOUND';

  constructor() {
    super('Специалист не найден.');
  }
}
