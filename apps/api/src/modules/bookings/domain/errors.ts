import { ConflictError } from '../../../shared/domain-error';

/** The requested time overlaps another active booking of the specialist. */
export class BookingConflictError extends ConflictError {
  readonly code = 'BOOKING_SLOT_TAKEN';

  constructor() {
    super('Выбранное время только что забронировали. Выберите другой слот.');
  }
}
