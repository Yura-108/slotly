// @ts-check
/**
 * Mutation testing of the pure code (docs/architecture/testing.md §4): Stryker changes the
 * code in small ways (`<` → `<=`, `&&` → `||`, a condition → true, a removed call) and runs
 * the unit tests. A mutant that no test notices marks code that is run but not checked.
 * @type {import('@stryker-mutator/api/core').PartialStrykerOptions}
 */
const config = {
  // pnpm isolates packages: Stryker cannot discover its plugins next to itself
  plugins: ['@stryker-mutator/vitest-runner', '@stryker-mutator/typescript-checker'],
  testRunner: 'vitest',
  vitest: { configFile: 'vitest.unit.config.mts' },
  // Mutants that would not compile are discarded instead of counted as killed
  checkers: ['typescript'],
  tsconfigFile: 'tsconfig.json',
  mutate: [
    'src/modules/*/domain/**/*.ts',
    'src/shared/**/*.ts',
    '!**/*.test.ts',
    '!**/errors.ts',
    '!**/domain-error.ts',
    '!**/messages.ts',
  ],
  reporters: ['clear-text', 'html', 'progress'],
  htmlReporter: { fileName: 'reports/mutation/index.html' },
  // Every survivor is either killed by a test or marked equivalent in the code with a reason
  // (`// Stryker disable next-line …: why`), so a new one shows up instead of hiding in a margin
  thresholds: { high: 100, low: 95, break: 95 },
};

export default config;
