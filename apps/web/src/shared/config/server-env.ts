import { z } from 'zod';

/**
 * The only place in apps/web that reads process.env (CLAUDE.md rule 9).
 * Server-only values: never prefix them with NEXT_PUBLIC_.
 */
const serverEnvSchema = z.object({
  API_INTERNAL_URL: z.url({ protocol: /^https?$/ }),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

export function loadServerEnv(env: Record<string, string | undefined> = process.env): ServerEnv {
  const result = serverEnvSchema.safeParse(env);
  if (!result.success) {
    throw new Error(`Invalid apps/web environment:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
