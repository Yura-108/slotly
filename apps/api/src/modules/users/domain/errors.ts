import { NotFoundError } from '../../../shared/domain-error';

export class UserNotFoundError extends NotFoundError {
  readonly code = 'NOT_FOUND';

  constructor() {
    super('Пользователь не найден.');
  }
}
