import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, type OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import { cleanupOpenApiDoc } from 'nestjs-zod';

/**
 * The API contract (ADR-007), built from the Zod DTOs and route decorators.
 * Paths are as NestJS serves them; the web app reaches them under /api.
 */
export function createOpenApiDocument(app: INestApplication): OpenAPIObject {
  const options = new DocumentBuilder()
    .setOpenAPIVersion('3.1.0')
    .setTitle('Slotly API')
    .setDescription(
      'Errors are RFC 9457 Problem Details (application/problem+json) with a stable `code`.',
    )
    .setVersion('1.0')
    .addCookieAuth('__Host-session')
    .build();
  // cleanupOpenApiDoc is required with nestjs-zod: it fixes schema names, nullability, refs
  return cleanupOpenApiDoc(SwaggerModule.createDocument(app, options));
}
