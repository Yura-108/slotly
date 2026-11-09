import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // SWC instead of esbuild: NestJS DI needs emitted decorator metadata
  plugins: [swc.vite({ jsc: { transform: { legacyDecorator: true, decoratorMetadata: true } } })],
  test: {
    include: ['src/**/*.test.ts'],
    // Integration tests (*.int.test.ts) start a PostgreSQL container in beforeAll
    hookTimeout: 120_000,
    testTimeout: 30_000,
  },
});
