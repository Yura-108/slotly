import { BusinessRuleError, ConflictError, NotFoundError } from '../../../shared/domain-error';

export class DayOffInPastError extends BusinessRuleError {
  readonly code = 'DAY_OFF_IN_PAST';

  constructor() {
    super('Нельзя отметить выходным день, который уже прошёл.');
  }
}

export class DayOffExistsError extends ConflictError {
  readonly code = 'DAY_OFF_EXISTS';

  constructor() {
    super('Этот день уже отмечен как выходной.');
  }
}

export class DayOffNotFoundError extends NotFoundError {
  readonly code = 'NOT_FOUND';

  constructor() {
    super('Выходной не найден.');
  }
}

/** Backstop for the exclusion constraint; the request validation reports overlaps first. */
export class ScheduleOverlapError extends ConflictError {
  readonly code = 'SCHEDULE_OVERLAP';

  constructor() {
    super('Рабочие интервалы одного дня пересекаются.');
  }
}
