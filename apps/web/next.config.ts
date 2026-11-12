import type { NextConfig } from 'next';
import { staticSecurityHeaders } from './src/shared/config/security-headers';
import { loadServerEnv } from './src/shared/config/server-env';

const { API_INTERNAL_URL, NEXT_DIST_DIR, NODE_ENV } = loadServerEnv();

const nextConfig: NextConfig = {
  distDir: NEXT_DIST_DIR,
  poweredByHeader: false,
  // Pages only: /api/* responses carry the API's own headers. The per-request
  // Content-Security-Policy is set in src/proxy.ts (it needs a nonce)
  async headers() {
    return [
      {
        source: '/((?!api/).*)',
        headers: staticSecurityHeaders({ production: NODE_ENV === 'production' }),
      },
    ];
  },
  // The browser talks to one origin; /api/* is proxied to NestJS so the session
  // cookie is first-party (ADR-005). Resolved at build time into routes-manifest.
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${API_INTERNAL_URL}/:path*` }];
  },
};

export default nextConfig;
