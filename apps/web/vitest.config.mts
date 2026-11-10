import { defineConfig } from 'vitest/config';

// Unit tests for framework-free code (src/shared/lib, feature logic).
// Browser end-to-end tests arrive in stage 6 (Playwright).
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
  },
});
