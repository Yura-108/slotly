import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';

export default defineConfig(
  // Generated: build output, migrations, coverage and mutation reports
  { ignores: ['dist/', 'drizzle/', 'coverage/', 'reports/', '.stryker-tmp/'] },
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
    // Domain gets the current time as a parameter (ADR-006): deterministic rules and tests
    files: ['src/modules/*/domain/**/*.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "CallExpression[callee.object.name='Date'][callee.property.name='now']",
          message: 'Domain code receives `now` as a parameter instead of reading the clock.',
        },
        {
          selector: "NewExpression[callee.name='Date'][arguments.length=0]",
          message: 'Domain code receives `now` as a parameter instead of reading the clock.',
        },
      ],
    },
  },
  {
    files: [
      'eslint.config.mjs',
      '.dependency-cruiser.cjs',
      '.lintstagedrc.mjs',
      'stryker.config.mjs',
    ],
    extends: [tseslint.configs.disableTypeChecked],
  },
  {
    files: ['.dependency-cruiser.cjs'],
    languageOptions: { sourceType: 'commonjs', globals: { module: 'writable' } },
  },
);
