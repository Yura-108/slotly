import js from '@eslint/js';
import playwright from 'eslint-plugin-playwright';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';

export default defineConfig(
  { ignores: ['test-results/', 'playwright-report/', 'blob-report/'] },
  js.configs.recommended,
  tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
  },
  {
    // Catches a forgotten `await`, focused or skipped tests, fixed waits
    files: ['tests/**/*.ts'],
    ...playwright.configs['flat/recommended'],
  },
  { files: ['eslint.config.mjs', '.lintstagedrc.mjs'], ...tseslint.configs.disableTypeChecked },
);
