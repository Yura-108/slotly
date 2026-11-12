import type { HttpServer } from '@nestjs/common';
import type { Express } from 'express';
import request from 'supertest';
import type { App } from 'supertest/types';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startTestApp, TEST_ORIGIN, type TestApp } from '../../test-utils/app';

/**
 * Routes anyone may call without a session (threat model, docs/architecture/security.md).
 * Written by hand on purpose: the test must not take "public" from @Public() itself,
 * otherwise a route marked public by mistake would be skipped and the test would agree
 * with the bug. Adding a route here is a security decision, made in review.
 */
const PUBLIC_ROUTES = [
  'GET /health',
  'POST /auth/register',
  'POST /auth/login',
  'POST /auth/logout',
  'POST /auth/verify-email',
  'POST /auth/password-reset/request',
  'POST /auth/password-reset/confirm',
  'GET /specialists/:slug',
  'GET /specialists/:slug/services',
  'GET /specialists/:slug/slots',
];

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

interface Route {
  method: string;
  path: string;
}

const key = (r: Route) => `${r.method} ${r.path}`;

/**
 * The routes the running Express app really serves: the source of truth, not OpenAPI.
 * Nest also registers catch-all `{/*splat}` handlers for every method (its 404 fallback);
 * they serve no endpoint and are left out.
 */
function routeTable(app: TestApp['app']): Route[] {
  const adapter = app.getHttpAdapter() as HttpServer<unknown, unknown, Express>;
  const express = adapter.getInstance();
  const routes = express.router.stack.flatMap(({ route }) => {
    if (!route || route.path.includes('*')) return [];
    const methods = new Set(route.stack.map((l) => l.method.toUpperCase()));
    return [...methods].map((method) => ({ method, path: route.path }));
  });
  return routes.sort((a, b) => key(a).localeCompare(key(b)));
}

/** Path parameters filled with values that pass no check: guards run before validation. */
const concrete = (path: string) => path.replace(/:(\w+)/g, (_, name: string) => `probe-${name}`);

let ipCounter = 0;
/** A fresh client IP per request, so login and registration rate limits never interfere. */
const probe = (server: App, route: Route, origin?: string) => {
  const agent = request(server);
  const path = concrete(route.path);
  const methods = {
    GET: () => agent.get(path),
    POST: () => agent.post(path),
    PUT: () => agent.put(path),
    PATCH: () => agent.patch(path),
    DELETE: () => agent.delete(path),
  };
  const send = methods[route.method as keyof typeof methods];
  if (!send) throw new Error('add the method to the probe: ' + key(route));
  const req = send().set('X-Forwarded-For', '198.51.100.' + String((++ipCounter % 250) + 1));
  if (origin) req.set('Origin', origin);
  return SAFE_METHODS.has(route.method) ? req : req.send({});
};

let testApp: TestApp;
let server: App;
let routes: Route[];

beforeAll(async () => {
  testApp = await startTestApp();
  server = testApp.app.getHttpServer();
  routes = routeTable(testApp.app);
});

afterAll(async () => {
  await testApp.close();
});

describe('access matrix: every route of the app', () => {
  it('requires a session everywhere except the public list, and the public list is exact', async () => {
    const publicRoutes: string[] = [];
    for (const route of routes) {
      const res = await probe(server, route, TEST_ORIGIN);
      if (res.status === 401) {
        expect(res.body, key(route)).toMatchObject({ code: 'UNAUTHENTICATED' });
      } else {
        publicRoutes.push(key(route));
      }
    }
    // A new public route fails here until it is added to PUBLIC_ROUTES consciously;
    // a route that stopped being public (or vanished) fails too
    expect(publicRoutes.sort()).toEqual([...PUBLIC_ROUTES].sort());
    expect(routes.length).toBeGreaterThan(PUBLIC_ROUTES.length);
  });

  it('rejects every state-changing request without our Origin, public routes included (CSRF)', async () => {
    const unsafe = routes.filter((r) => !SAFE_METHODS.has(r.method));
    expect(unsafe.length).toBeGreaterThan(0);

    for (const route of unsafe) {
      for (const origin of [undefined, 'https://evil.example']) {
        const res = await probe(server, route, origin);
        expect(res.status, `${key(route)} from ${origin ?? 'no Origin'}`).toBe(403);
        expect(res.body).toMatchObject({ code: 'ORIGIN_NOT_ALLOWED' });
      }
    }
  });
});
