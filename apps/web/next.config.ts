import type { NextConfig } from 'next';
import { loadServerEnv } from './src/shared/config/server-env';

const { API_INTERNAL_URL } = loadServerEnv();

const nextConfig: NextConfig = {
  // The browser talks to one origin; /api/* is proxied to NestJS so the session
  // cookie is first-party (ADR-005). Resolved at build time into routes-manifest.
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${API_INTERNAL_URL}/:path*` }];
  },
};

export default nextConfig;
