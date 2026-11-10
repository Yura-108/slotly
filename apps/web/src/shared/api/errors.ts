import type { components } from './schema';

export type ProblemDetails = components['schemas']['ProblemDetails'];

/** One place that turns API errors into UI behaviour, by `code` (frontend.md §5). */
export function isProblemDetails(value: unknown): value is ProblemDetails {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { code?: unknown }).code === 'string' &&
    typeof (value as { status?: unknown }).status === 'number'
  );
}

/**
 * Message for the user. The API already writes `detail` in Russian; for unexpected
 * errors we add the request id ("код обращения") so the request can be found in logs.
 */
export function problemMessage(error: unknown): string {
  if (!isProblemDetails(error)) return 'Не удалось связаться с сервером. Проверьте подключение.';
  if (error.status >= 500) {
    return error.requestId ? `${error.detail} Код обращения: ${error.requestId}.` : error.detail;
  }
  return error.detail;
}

/** Field errors of VALIDATION_FAILED keyed by field path, for form inputs. */
export function fieldErrors(error: unknown): Record<string, string> {
  if (!isProblemDetails(error) || error.code !== 'VALIDATION_FAILED') return {};
  return Object.fromEntries((error.errors ?? []).map((e) => [e.path, e.message]));
}
