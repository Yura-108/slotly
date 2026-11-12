import { defineConfig, mergeConfig } from 'vitest/config';
import base from './vitest.config.mjs';

/**
 * Unit tests only: no Docker, seconds to run. Used for coverage and mutation testing of
 * the pure code — domain rules and shared helpers (docs/architecture/testing.md §4).
 */
export default mergeConfig(
  base,
  defineConfig({
    test: {
      include: ['src/**/*.test.ts'],
      exclude: ['src/**/*.int.test.ts', 'src/**/*.e2e.test.ts'],
      coverage: {
        provider: 'v8',
        include: ['src/modules/*/domain/**/*.ts', 'src/shared/**/*.ts'],
        // Declarations without logic: error classes (checked by API e2e through their
        // codes) and the email payload schemas (checked where messages are enqueued)
        exclude: ['**/*.test.ts', '**/errors.ts', '**/domain-error.ts', '**/messages.ts'],
        reporter: ['text', 'html'],
        // A floor, not a goal: "this code is run by some test". Whether the tests would
        // notice a bug is measured by mutation testing (Stryker). The gap to 100% is
        // unreachable fallbacks (Intl always returns every date part)
        thresholds: { statements: 95, lines: 95, functions: 95, branches: 90 },
      },
    },
  }),
);
