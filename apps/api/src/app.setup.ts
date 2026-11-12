import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import { z } from 'zod';
import { AppConfig } from './infrastructure/config/config.schema';
import { securityHeaders } from './infrastructure/http/security-headers';

/**
 * Express-level setup shared by main.ts, e2e tests and OpenAPI generation,
 * so tests exercise exactly the production pipeline.
 */
export function configureApp(app: NestExpressApplication): void {
  const config = app.get(AppConfig);

  // Validation messages in Russian: the UI language (requirements.md §7)
  z.config(z.locales.ru());

  // req.ip comes from X-Forwarded-For only when the direct peer is a trusted proxy;
  // Express takes the rightmost untrusted address, so a client cannot spoof it.
  app.set('trust proxy', config.trustedProxy);
  app.disable('x-powered-by');
  // Before any route, so errors, 404s and rate-limit responses carry them too
  app.use(securityHeaders);
  app.use(cookieParser());
}
