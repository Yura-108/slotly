import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';

export default defineConfig(
  { ignores: ['dist/', 'drizzle/'] },
  js.configs.recommended,
  tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      // Configuration is read only through AppConfig (ADR-008, CLAUDE.md rule 9)
      'no-restricted-properties': [
        'error',
        {
          object: 'process',
          property: 'env',
          message: 'Inject AppConfig instead of reading process.env directly.',
        },
      ],
    },
  },
  {
    files: ['src/infrastructure/config/**', '*.config.ts', '*.config.mts'],
    rules: { 'no-restricted-properties': 'off' },
  },
  {
    files: ['eslint.config.mjs'],
    extends: [tseslint.configs.disableTypeChecked],
  },
);
