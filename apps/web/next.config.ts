import path from 'node:path';
import type { NextConfig } from 'next';
import { staticSecurityHeaders } from './src/shared/config/security-headers';
import { loadBuildEnv } from './src/shared/config/server-env';

const { NEXT_DIST_DIR, NODE_ENV } = loadBuildEnv();

const nextConfig: NextConfig = {
  distDir: NEXT_DIST_DIR,
  // A self-contained server.js with only the files it uses: the Docker image (ADR-018)
  output: 'standalone',
  // Trace from the monorepo root: dependencies live in the root node_modules (pnpm)
  outputFileTracingRoot: path.join(import.meta.dirname, '../../'),
  poweredByHeader: false,
  // Pages only: /api/* responses carry the API's own headers. The per-request
  // Content-Security-Policy and the /api/* proxy are in src/proxy.ts (run time, not build time)
  async headers() {
    return [
      {
        source: '/((?!api/).*)',
        headers: staticSecurityHeaders({ production: NODE_ENV === 'production' }),
      },
    ];
  },
};

export default nextConfig;
