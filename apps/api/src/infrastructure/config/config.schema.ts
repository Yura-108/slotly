import { existsSync } from 'node:fs';
import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  APP_ORIGIN: z.url({ protocol: /^https?$/ }),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  LOG_FORMAT: z.enum(['json', 'pretty']).default('json'),
  SESSION_COOKIE_NAME: z
    .string()
    .regex(/^[A-Za-z0-9_-]+$/)
    .default('__Host-session'),
  COOKIE_SECURE: z.stringbool().default(true),
  // Express "trust proxy": addresses allowed to set X-Forwarded-For (keywords, IPs or CIDRs)
  TRUSTED_PROXY: z.string().min(1).default('loopback'),
  // ADR-012: one SMTP path everywhere — Mailpit locally, the email provider's SMTP in production
  SMTP_URL: z.url({ protocol: /^smtps?$/ }),
  EMAIL_FROM: z.string().min(3),
  // How often the outbox worker polls; 0 disables the loop (tests process batches explicitly)
  OUTBOX_POLL_INTERVAL_MS: z.coerce.number().int().min(0).default(5000),
  // Background jobs (backend.md §4); 0 disables a loop (tests run jobs explicitly)
  BOOKING_EXPIRY_INTERVAL_MS: z.coerce.number().int().min(0).default(60_000),
  CLEANUP_INTERVAL_MS: z.coerce.number().int().min(0).default(3_600_000),
});

type Env = z.infer<typeof envSchema>;

/**
 * Typed application configuration. Abstract class so it can serve as a DI token;
 * the provided value is a plain object produced by {@link loadConfig}.
 */
export abstract class AppConfig {
  declare readonly port: number;
  declare readonly databaseUrl: string;
  /** Bare origin (`scheme://host[:port]`) of the web app: Origin check, links in emails. */
  declare readonly appOrigin: string;
  declare readonly session: {
    readonly cookieName: string;
    readonly cookieSecure: boolean;
  };
  declare readonly trustedProxy: string;
  declare readonly email: {
    readonly smtpUrl: string;
    readonly from: string;
  };
  declare readonly outbox: {
    readonly pollIntervalMs: number;
  };
  declare readonly jobs: {
    /** Marks overdue requests expired and emails clients; correctness does not depend on it. */
    readonly bookingExpiryIntervalMs: number;
    /** Deletes expired sessions and tokens, old outbox messages. */
    readonly cleanupIntervalMs: number;
  };
  declare readonly log: {
    readonly level: Env['LOG_LEVEL'];
    readonly format: Env['LOG_FORMAT'];
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
  // Browsers silently drop a __Host- cookie without the Secure flag: fail at startup instead
  if (e.SESSION_COOKIE_NAME.startsWith('__Host-') && !e.COOKIE_SECURE) {
    throw new ConfigValidationError(
      'Invalid environment configuration:\nSESSION_COOKIE_NAME with the __Host- prefix requires COOKIE_SECURE=true',
    );
  }
  return {
    port: e.PORT,
    databaseUrl: e.DATABASE_URL,
    // Compared with the Origin header byte for byte, so keep only scheme://host[:port]
    appOrigin: new URL(e.APP_ORIGIN).origin,
    session: { cookieName: e.SESSION_COOKIE_NAME, cookieSecure: e.COOKIE_SECURE },
    trustedProxy: e.TRUSTED_PROXY,
    email: { smtpUrl: e.SMTP_URL, from: e.EMAIL_FROM },
    outbox: { pollIntervalMs: e.OUTBOX_POLL_INTERVAL_MS },
    jobs: {
      bookingExpiryIntervalMs: e.BOOKING_EXPIRY_INTERVAL_MS,
      cleanupIntervalMs: e.CLEANUP_INTERVAL_MS,
    },
    log: { level: e.LOG_LEVEL, format: e.LOG_FORMAT },
  };
}

/** Local development convenience: loads `.env` if present. Production sets real env variables. */
export function loadEnvFileIfPresent(path = '.env'): void {
  if (existsSync(path)) {
    process.loadEnvFile(path);
  }
}
