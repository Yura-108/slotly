import { z } from 'zod';

/**
 * The only place in apps/web that reads process.env (CLAUDE.md rule 9).
 * Server-only values: never prefix them with NEXT_PUBLIC_.
 */
const serverEnvSchema = z.object({
  API_INTERNAL_URL: z.url({ protocol: /^https?$/ }),
  // Must match the API (apps/api SESSION_COOKIE_NAME); used only for the optimistic redirect
  SESSION_COOKIE_NAME: z.string().min(1).default('__Host-session'),
  // Build output directory; the e2e stack builds into its own so dev's .next is untouched
  NEXT_DIST_DIR: z.string().min(1).default('.next'),
  // Set by Next.js itself: development for next dev, production for next build/start
  NODE_ENV: z.enum(['development', 'production', 'test']).default('production'),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

/**
 * What next.config.ts needs while building. The API address is not here: it is read when
 * the server starts (proxy.ts), so one build runs in every environment (ADR-018).
 */
const buildEnvSchema = serverEnvSchema.pick({ NEXT_DIST_DIR: true, NODE_ENV: true });

export function loadBuildEnv(env: Record<string, string | undefined> = process.env) {
  const result = buildEnvSchema.safeParse(env);
  if (!result.success) {
    throw new Error(`Invalid apps/web build environment:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}

export function loadServerEnv(env: Record<string, string | undefined> = process.env): ServerEnv {
  const result = serverEnvSchema.safeParse(env);
  if (!result.success) {
    throw new Error(`Invalid apps/web environment:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
