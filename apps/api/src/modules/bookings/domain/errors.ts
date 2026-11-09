import { DomainError } from '../../../shared/domain-error';

/** The requested time overlaps another active booking of the specialist (409). */
export class BookingConflictError extends DomainError {
  readonly code = 'BOOKING_SLOT_TAKEN';

  constructor() {
    super('The requested time overlaps an active booking');
  }
}
