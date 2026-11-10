import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import type { App } from 'supertest/types';
import type { Database } from '../infrastructure/database/database.module';
import { users } from '../infrastructure/database/schema';
import { TEST_ORIGIN } from './app';

const COOKIE = '__Host-session';
export const TEST_PASSWORD = 'correct horse battery';

let ipCounter = 0;

/**
 * A browser-like client for e2e tests: our Origin, its own client IP (so per-IP rate
 * limits of one test do not affect another) and an optional session cookie.
 */
export function httpClient(server: App, session?: string) {
  const ip = `192.0.2.${(++ipCounter % 250) + 1}`;
  const prepare = (req: request.Test) => {
    req.set('X-Forwarded-For', ip);
    if (session) req.set('Cookie', `${COOKIE}=${session}`);
    return req;
  };
  return {
    get: (path: string) => prepare(request(server).get(path)),
    post: (path: string, body?: object) =>
      prepare(request(server).post(path).set('Origin', TEST_ORIGIN)).send(body),
    patch: (path: string, body: object) =>
      prepare(request(server).patch(path).set('Origin', TEST_ORIGIN)).send(body),
    put: (path: string, body: object) =>
      prepare(request(server).put(path).set('Origin', TEST_ORIGIN)).send(body),
    delete: (path: string) => prepare(request(server).delete(path).set('Origin', TEST_ORIGIN)),
  };
}

export const uniqueEmail = () => `user-${randomUUID().slice(0, 8)}@example.test`;

/**
 * Registers and signs in through the API. Email confirmation is set directly in the
 * database: its own flow is covered by auth-email.e2e.test.ts.
 */
export async function signedInUser(
  server: App,
  db: Database,
  options: { verified?: boolean } = {},
): Promise<{ email: string; session: string; userId: string }> {
  const email = uniqueEmail();
  const anonymous = httpClient(server);
  await anonymous
    .post('/auth/register', {
      email,
      password: TEST_PASSWORD,
      name: 'Анна',
      timezone: 'Europe/Moscow',
    })
    .expect(202);
  const [user] = await db
    .update(users)
    .set({ emailVerifiedAt: options.verified === false ? null : new Date() })
    .where(eq(users.email, email))
    .returning({ id: users.id });
  if (!user) throw new Error('registered user not found');

  const login = await anonymous.post('/auth/login', { email, password: TEST_PASSWORD }).expect(204);
  const cookie = login.get('Set-Cookie')?.find((c) => c.startsWith(`${COOKIE}=`)) ?? '';
  return { email, session: cookie.slice(COOKIE.length + 1).split(';')[0] ?? '', userId: user.id };
}
