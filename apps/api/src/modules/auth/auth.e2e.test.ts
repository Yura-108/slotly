import { createHash, randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import type { App } from 'supertest/types';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sessions, users } from '../../infrastructure/database/schema';
import { startTestApp, TEST_ORIGIN, type TestApp } from '../../test-utils/app';

const COOKIE = '__Host-session';
const PASSWORD = 'correct horse battery';

let testApp: TestApp;
let server: App;
let ipCounter = 0;

/**
 * Each test acts as its own client IP (X-Forwarded-For from the trusted loopback peer),
 * so per-IP rate limits of one test do not affect another.
 */
function client() {
  const ip = `198.51.100.${++ipCounter}`;
  return {
    post: (path: string, body?: object) =>
      request(server).post(path).set('Origin', TEST_ORIGIN).set('X-Forwarded-For', ip).send(body),
    get: (path: string) => request(server).get(path).set('X-Forwarded-For', ip),
  };
}

const newEmail = () => `user-${randomUUID().slice(0, 8)}@example.test`;

function registration(email = newEmail()) {
  return { email, password: PASSWORD, name: 'Анна', timezone: 'Europe/Moscow' };
}

function sessionToken(response: request.Response): string {
  const cookies = response.get('Set-Cookie') ?? [];
  const cookie = cookies.find((c) => c.startsWith(`${COOKIE}=`));
  if (!cookie) throw new Error('session cookie was not set');
  return cookie.slice(COOKIE.length + 1).split(';')[0] ?? '';
}

async function registerAndLogin(c: ReturnType<typeof client>, email = newEmail()) {
  await c.post('/auth/register', registration(email)).expect(202);
  const login = await c.post('/auth/login', { email, password: PASSWORD }).expect(204);
  return { email, token: sessionToken(login) };
}

beforeAll(async () => {
  testApp = await startTestApp();
  server = testApp.app.getHttpServer();
});

afterAll(async () => {
  await testApp?.close();
});

describe('registration', () => {
  it('answers identically for a new and an already registered email', async () => {
    const c = client();
    const email = newEmail();
    const first = await c.post('/auth/register', registration(email)).expect(202);
    const second = await c
      .post('/auth/register', {
        ...registration(email.toUpperCase()),
        password: 'another password',
      })
      .expect(202);

    expect(second.text).toBe(first.text);
    const rows = await testApp.database.db.select().from(users).where(eq(users.email, email));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.passwordHash).toMatch(/^\$argon2id\$/);
  });

  it('rejects invalid input with field errors as Problem Details', async () => {
    const response = await client()
      .post('/auth/register', {
        email: 'not-an-email',
        password: 'short',
        name: '',
        timezone: 'Mars/Base',
      })
      .expect(400)
      .expect('Content-Type', /application\/problem\+json/);

    expect(response.body).toMatchObject({ status: 400, code: 'VALIDATION_FAILED' });
    const body = response.body as { errors: { path: string }[]; requestId: string };
    expect(body.errors.map((e) => e.path).sort()).toEqual([
      'email',
      'name',
      'password',
      'timezone',
    ]);
    expect(body.requestId).toBe(response.get('X-Request-Id'));
  });

  it('rejects malformed JSON as a 400 Problem Details', async () => {
    const response = await client()
      .post('/auth/register')
      .set('Content-Type', 'application/json')
      .send('{"email":')
      .expect(400)
      .expect('Content-Type', /application\/problem\+json/);
    expect(response.body).toMatchObject({ code: 'BAD_REQUEST' });
  });
});

describe('login', () => {
  it('gives the same answer for an unknown email and a wrong password', async () => {
    const c = client();
    const email = newEmail();
    await c.post('/auth/register', registration(email)).expect(202);

    const unknown = await c
      .post('/auth/login', { email: newEmail(), password: PASSWORD })
      .expect(401);
    const wrong = await c.post('/auth/login', { email, password: 'wrong password' }).expect(401);

    // Everything except the per-request id must match
    const strip = (body: Record<string, unknown>) => ({ ...body, requestId: undefined });
    expect(strip(unknown.body as Record<string, unknown>)).toEqual(
      strip(wrong.body as Record<string, unknown>),
    );
    expect(wrong.body).toMatchObject({ code: 'INVALID_CREDENTIALS' });
  });

  it('sets a __Host- session cookie and stores only the token hash', async () => {
    const c = client();
    const email = newEmail();
    await c.post('/auth/register', registration(email)).expect(202);
    const response = await c
      .post('/auth/login', { email: `  ${email.toUpperCase()} `, password: PASSWORD })
      .expect(204);

    const cookie = response.get('Set-Cookie')?.find((v) => v.startsWith(`${COOKIE}=`)) ?? '';
    expect(cookie).toMatch(/; Path=\//);
    expect(cookie).toMatch(/; HttpOnly/);
    expect(cookie).toMatch(/; Secure/);
    expect(cookie).toMatch(/; SameSite=Lax/);
    expect(cookie).toMatch(/; Max-Age=7776000/);
    expect(cookie).not.toMatch(/Domain=/);

    const token = sessionToken(response);
    const hash = createHash('sha256').update(token).digest();
    const [stored] = await testApp.database.db
      .select()
      .from(sessions)
      .where(eq(sessions.tokenHash, hash));
    expect(stored).toBeDefined();
    expect(JSON.stringify(stored)).not.toContain(token);
  });
});

describe('current user and logout', () => {
  it('returns the profile without internal fields', async () => {
    const c = client();
    const { email, token } = await registerAndLogin(c);

    const response = await c.get('/me').set('Cookie', `${COOKIE}=${token}`).expect(200);
    expect(response.body).toEqual({
      id: expect.any(String) as string,
      email,
      name: 'Анна',
      timezone: 'Europe/Moscow',
      emailVerified: false,
    });
  });

  it('requires a valid session', async () => {
    const c = client();
    const noCookie = await c.get('/me').expect(401);
    expect(noCookie.body).toMatchObject({ code: 'UNAUTHENTICATED' });
    await c.get('/me').set('Cookie', `${COOKIE}=forged-token`).expect(401);
  });

  it('logout revokes the session on the server and clears the cookie', async () => {
    const c = client();
    const { token } = await registerAndLogin(c);

    const response = await c.post('/auth/logout').set('Cookie', `${COOKIE}=${token}`).expect(204);
    expect(response.get('Set-Cookie')?.join()).toMatch(
      /__Host-session=;.*Expires=Thu, 01 Jan 1970/,
    );

    // The old token is dead even if a client kept it
    await c.get('/me').set('Cookie', `${COOKIE}=${token}`).expect(401);
  });

  it('rejects and deletes an expired session', async () => {
    const c = client();
    const { token } = await registerAndLogin(c);
    const hash = createHash('sha256').update(token).digest();
    await testApp.database.db
      .update(sessions)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(sessions.tokenHash, hash));

    await c.get('/me').set('Cookie', `${COOKIE}=${token}`).expect(401);
    const left = await testApp.database.db
      .select()
      .from(sessions)
      .where(eq(sessions.tokenHash, hash));
    expect(left).toHaveLength(0);
  });
});

describe('cross-cutting HTTP rules', () => {
  it('rejects state-changing requests without our Origin (CSRF)', async () => {
    const body = registration();
    const missing = await request(server).post('/auth/register').send(body).expect(403);
    expect(missing.body).toMatchObject({ code: 'ORIGIN_NOT_ALLOWED' });

    await request(server)
      .post('/auth/register')
      .set('Origin', 'https://evil.example')
      .send(body)
      .expect(403);
  });

  it('rate-limits login attempts per client IP', async () => {
    const attacker = client();
    const attempt = () => attacker.post('/auth/login', { email: newEmail(), password: 'guess' });
    for (let i = 0; i < 10; i++) await attempt().expect(401);

    const limited = await attempt().expect(429);
    expect(limited.body).toMatchObject({ code: 'RATE_LIMITED' });
    expect(Number(limited.get('Retry-After'))).toBeGreaterThan(0);

    // Another client is not affected
    await client().post('/auth/login', { email: newEmail(), password: 'guess' }).expect(401);
  });

  it('answers unknown routes with Problem Details 404', async () => {
    const response = await client().get('/no-such-route').expect(404);
    expect(response.body).toMatchObject({ code: 'NOT_FOUND' });
  });

  it('keeps the health probes public', async () => {
    await client().get('/health/live').expect(200, { status: 'ok' });
    await client().get('/health/ready').expect(200, { status: 'ok' });
  });
});
