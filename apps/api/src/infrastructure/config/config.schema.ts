import { existsSync } from 'node:fs';
import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  APP_ORIGIN: z.url(),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  LOG_FORMAT: z.enum(['json', 'pretty']).default('json'),
});

/**
 * Typed application configuration. Abstract class so it can serve as a DI token;
 * the provided value is a plain object produced by {@link loadConfig}.
 */
export abstract class AppConfig {
  declare readonly port: number;
  declare readonly databaseUrl: string;
  declare readonly appOrigin: string;
  declare readonly log: {
    readonly level: z.infer<typeof envSchema>['LOG_LEVEL'];
    readonly format: z.infer<typeof envSchema>['LOG_FORMAT'];
  };
}

export class ConfigValidationError extends Error {
  override readonly name = 'ConfigValidationError';
}

/** Validates environment variables once at startup and fails fast with all problems listed. */
export function loadConfig(env: Record<string, string | undefined>): AppConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    throw new ConfigValidationError(
      `Invalid environment configuration:\n${z.prettifyError(parsed.error)}`,
    );
  }
  const e = parsed.data;
  return {
    port: e.PORT,
    databaseUrl: e.DATABASE_URL,
    appOrigin: e.APP_ORIGIN,
    log: { level: e.LOG_LEVEL, format: e.LOG_FORMAT },
  };
}

/** Local development convenience: loads `.env` if present. Production sets real env variables. */
export function loadEnvFileIfPresent(path = '.env'): void {
  if (existsSync(path)) {
    process.loadEnvFile(path);
  }
}
