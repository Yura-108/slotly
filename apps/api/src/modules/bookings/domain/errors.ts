import {
  BusinessRuleError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from '../../../shared/domain-error';
import { PENDING_LIMIT } from './booking-policy';

/** The requested time overlaps another active booking of the specialist. */
export class BookingConflictError extends ConflictError {
  readonly code = 'BOOKING_SLOT_TAKEN';

  constructor() {
    super('Выбранное время только что забронировали. Выберите другой слот.');
  }
}

/**
 * The time is not a slot the specialist offers: off the grid, a day off, too soon or
 * beyond the horizon. Different from "taken" (409): choosing it again will not help.
 */
export class SlotNotAvailableError extends BusinessRuleError {
  readonly code = 'SLOT_NOT_AVAILABLE';

  constructor() {
    super('На это время записаться нельзя. Выберите время из списка свободных.');
  }
}

export class CannotBookSelfError extends BusinessRuleError {
  readonly code = 'CANNOT_BOOK_SELF';

  constructor() {
    super('Нельзя записаться к самому себе.');
  }
}

/** FR-56: limits spam requests that would block a specialist's time for a day. */
export class PendingLimitReachedError extends BusinessRuleError {
  readonly code = 'PENDING_LIMIT_REACHED';

  constructor() {
    super(
      `У вас уже ${PENDING_LIMIT} заявки к этому специалисту, ожидающие подтверждения. Дождитесь ответа на них.`,
    );
  }
}

/** Booking needs a reachable client: confirmations and changes are sent by email. */
export class EmailNotVerifiedError extends ForbiddenError {
  readonly code = 'EMAIL_NOT_VERIFIED';

  constructor() {
    super('Подтвердите email, чтобы записываться к специалистам.');
  }
}

/** Also for someone else's booking: it must look like it does not exist (IDOR). */
export class BookingNotFoundError extends NotFoundError {
  readonly code = 'NOT_FOUND';

  constructor() {
    super('Запись не найдена.');
  }
}

/**
 * The page showed an older state: the booking was confirmed, cancelled or expired meanwhile,
 * or a concurrent change won the compare-and-set (data-model.md §4).
 */
export class BookingStatusChangedError extends ConflictError {
  readonly code = 'BOOKING_STATUS_CHANGED';

  constructor() {
    super('Статус записи уже изменился. Обновите страницу.');
  }
}

/** FR-53: after the deadline (fixed at booking time) only the specialist can cancel. */
export class CancelDeadlinePassedError extends BusinessRuleError {
  readonly code = 'CANCEL_DEADLINE_PASSED';

  constructor() {
    super('Срок самостоятельной отмены прошёл. Отменить запись может только специалист.');
  }
}

export class BookingAlreadyStartedError extends BusinessRuleError {
  readonly code = 'BOOKING_ALREADY_STARTED';

  constructor() {
    super('Запись уже началась, изменить её нельзя.');
  }
}

/** A client trying to confirm or reject: only the specialist answers a request. */
export class BookingActionForbiddenError extends ForbiddenError {
  readonly code = 'BOOKING_ACTION_FORBIDDEN';

  constructor() {
    super('Это действие доступно только специалисту.');
  }
}
