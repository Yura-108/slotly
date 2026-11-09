/**
 * Base class for business errors. Carries a stable machine-readable `code`
 * (api.md §3); mapping to HTTP happens only in the global exception filter.
 */
export abstract class DomainError extends Error {
  abstract readonly code: string;

  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}
