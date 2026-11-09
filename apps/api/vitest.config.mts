import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // SWC instead of esbuild: NestJS DI needs emitted decorator metadata
  plugins: [swc.vite({ jsc: { transform: { legacyDecorator: true, decoratorMetadata: true } } })],
  test: {
    include: ['src/**/*.test.ts'],
  },
});
