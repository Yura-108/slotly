import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores(['.next/**', '.next-e2e/**', 'out/**', 'build/**', 'next-env.d.ts']),
  {
    rules: {
      // Environment is read only in shared/config (CLAUDE.md rule 9)
      'no-restricted-properties': [
        'error',
        {
          object: 'process',
          property: 'env',
          message: 'Read environment through src/shared/config instead of process.env.',
        },
      ],
    },
  },
  {
    files: ['src/shared/config/**', '*.config.ts', '*.config.mjs'],
    rules: { 'no-restricted-properties': 'off' },
  },
  {
    // Zod in the browser must run without eval under the page CSP (ADR-014)
    files: ['src/**'],
    ignores: ['src/shared/lib/zod.ts', 'src/shared/config/server-env.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'zod',
              message:
                "Import z from '@/shared/lib/zod': it turns off Zod's eval probe blocked by CSP.",
            },
          ],
        },
      ],
    },
  },
]);
