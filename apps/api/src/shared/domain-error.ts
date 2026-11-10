/**
 * Base class for business errors. Carries a stable machine-readable `code` (api.md §3).
 * `message` is safe to show to the user (it becomes `detail` in Problem Details), so it
 * never contains internal data. Mapping to HTTP happens only in the global exception filter,
 * by the category class below — domain code knows nothing about HTTP.
 */
export abstract class DomainError extends Error {
  abstract readonly code: string;

  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/** The caller is not authenticated or credentials are wrong (401). */
export abstract class UnauthenticatedError extends DomainError {}

/** Authenticated, but not allowed to do this (403). */
export abstract class ForbiddenError extends DomainError {}

/** The resource does not exist or belongs to someone else (404). */
export abstract class NotFoundError extends DomainError {}

/** Conflicts with a concurrent change; retrying with fresh data may help (409). */
export abstract class ConflictError extends DomainError {}

/** The request is valid, but a business rule forbids it now; retrying will not help (422). */
export abstract class BusinessRuleError extends DomainError {}
