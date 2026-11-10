import { UnauthenticatedError } from '../../../shared/domain-error';

/** One message for "no such email" and "wrong password": the response must not reveal which. */
export class InvalidCredentialsError extends UnauthenticatedError {
  readonly code = 'INVALID_CREDENTIALS';

  constructor() {
    super('Неверный email или пароль.');
  }
}

export class NotAuthenticatedError extends UnauthenticatedError {
  readonly code = 'UNAUTHENTICATED';

  constructor() {
    super('Войдите, чтобы продолжить.');
  }
}
