import { applyDecorators } from '@nestjs/common';
import { ApiExtraModels, ApiResponse, getSchemaPath } from '@nestjs/swagger';
import { ProblemDetailsDto } from './problem-details';

const DESCRIPTIONS: Record<number, string> = {
  400: 'Validation failed (VALIDATION_FAILED)',
  401: 'Not authenticated',
  403: 'Forbidden (e.g. ORIGIN_NOT_ALLOWED)',
  404: 'Not found',
  409: 'Conflict with a concurrent change',
  422: 'Business rule violation',
  429: 'Rate limited (RATE_LIMITED), see Retry-After',
};

/** Documents error responses as `application/problem+json`, so the web client gets typed errors. */
export function ApiProblems(...statuses: number[]) {
  return applyDecorators(
    ApiExtraModels(ProblemDetailsDto),
    ...statuses.map((status) =>
      ApiResponse({
        status,
        description: DESCRIPTIONS[status] ?? 'Error',
        content: {
          'application/problem+json': { schema: { $ref: getSchemaPath(ProblemDetailsDto) } },
        },
      }),
    ),
  );
}
