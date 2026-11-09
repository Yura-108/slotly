import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores(['.next/**', 'out/**', 'build/**', 'next-env.d.ts']),
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
]);
