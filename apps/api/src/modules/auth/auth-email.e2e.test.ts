import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import type { App } from 'supertest/types';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { authTokens, outboxMessages, users } from '../../infrastructure/database/schema';
import { startTestApp, TEST_ORIGIN, type TestApp } from '../../test-utils/app';
import { startMailpit, type TestMailbox } from '../../test-utils/mailpit';
import { OutboxProcessor } from '../notifications/outbox.processor';

const COOKIE = '__Host-session';
const PASSWORD = 'correct horse battery';

let testApp: TestApp;
let mailbox: TestMailbox;
let server: App;
let ipCounter = 0;

function client() {
  const ip = `203.0.113.${++ipCounter}`;
  return {
    post: (path: string, body?: object, cookie?: string) => {
      const req = request(server).post(path).set('Origin', TEST_ORIGIN).set('X-Forwarded-For', ip);
      if (cookie) req.set('Cookie', `${COOKIE}=${cookie}`);
      return req.send(body);
    },
    patch: (path: string, body: object, cookie: string) =>
      request(server)
        .patch(path)
        .set('Origin', TEST_ORIGIN)
        .set('X-Forwarded-For', ip)
        .set('Cookie', `${COOKIE}=${cookie}`)
        .send(body),
    get: (path: string, cookie?: string) => {
      const req = request(server).get(path).set('X-Forwarded-For', ip);
      if (cookie) req.set('Cookie', `${COOKIE}=${cookie}`);
      return req;
    },
  };
}

type Client = ReturnType<typeof client>;
const newEmail = () => `user-${randomUUID().slice(0, 8)}@example.test`;

/** What the worker loop does every few seconds; tests trigger it explicitly. */
const deliverEmails = () => testApp.app.get(OutboxProcessor).processDue();

const SUBJECTS = {
  verify: 'Подтвердите email в Slotly',
  reset: 'Сброс пароля в Slotly',
  exists: 'Вход в Slotly',
} as const;

/**
 * Emails sent within the same batch may arrive in any order (same millisecond),
 * so tests look them up by subject, never by position.
 */
async function emailsWith(address: string, subject: string) {
  return (await mailbox.inbox(address)).filter((m) => m.subject === subject);
}

async function onlyEmailWith(address: string, subject: string) {
  const found = await emailsWith(address, subject);
  if (found.length !== 1)
    throw new Error(`expected one "${subject}" for ${address}, got ${found.length}`);
  return found[0] as (typeof found)[number];
}

function tokenFrom(text: string, path: '/verify-email' | '/reset-password'): string {
  const match = new RegExp(`${TEST_ORIGIN}${path}#token=([A-Za-z0-9_-]+)`).exec(text);
  if (!match?.[1]) throw new Error(`no ${path} link in email`);
  return match[1];
}

function sessionToken(response: request.Response): string {
  const cookie = response.get('Set-Cookie')?.find((c) => c.startsWith(`${COOKIE}=`));
  if (!cookie) throw new Error('session cookie was not set');
  return cookie.slice(COOKIE.length + 1).split(';')[0] ?? '';
}

async function register(c: Client, email = newEmail()) {
  await c
    .post('/auth/register', { email, password: PASSWORD, name: 'Анна', timezone: 'Europe/Moscow' })
    .expect(202);
  return email;
}

async function login(c: Client, email: string, password = PASSWORD) {
  return sessionToken(await c.post('/auth/login', { email, password }).expect(204));
}

beforeAll(async () => {
  mailbox = await startMailpit();
  testApp = await startTestApp({ smtpUrl: mailbox.smtpUrl });
  server = testApp.app.getHttpServer();
});

afterAll(async () => {
  await testApp?.close();
  await mailbox?.stop();
});

describe('email confirmation', () => {
  it('sends a link that confirms the email exactly once', async () => {
    const c = client();
    const email = await register(c);
    await deliverEmails();

    const message = await onlyEmailWith(email, SUBJECTS.verify);
    const token = tokenFrom(message.text, '/verify-email');

    await c.post('/auth/verify-email', { token }).expect(204);
    const session = await login(c, email);
    const me = await c.get('/me', session).expect(200);
    expect(me.body).toMatchObject({ emailVerified: true });

    const reused = await c.post('/auth/verify-email', { token }).expect(422);
    expect(reused.body).toMatchObject({ code: 'TOKEN_INVALID_OR_EXPIRED' });
  });

  it('keeps the one-time link out of the outbox once delivered', async () => {
    const c = client();
    const email = await register(c);
    await deliverEmails();

    const rows = await testApp.database.db.select().from(outboxMessages);
    const mine = rows.filter((r) => r.payload['to'] === email);
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ status: 'sent' });
    expect(JSON.stringify(mine[0]?.payload)).not.toContain('#token=');
  });

  it('rejects an expired link', async () => {
    const c = client();
    const email = await register(c);
    await deliverEmails();
    const token = tokenFrom((await onlyEmailWith(email, SUBJECTS.verify)).text, '/verify-email');
    await testApp.database.db.update(authTokens).set({ expiresAt: new Date(Date.now() - 1000) });

    await c.post('/auth/verify-email', { token }).expect(422);
  });

  it('resends a fresh link and revokes the previous one', async () => {
    const c = client();
    const email = await register(c);
    await deliverEmails();
    const [firstEmail] = await emailsWith(email, SUBJECTS.verify);
    const first = tokenFrom(firstEmail?.text ?? '', '/verify-email');

    const session = await login(c, email);
    await c.post('/auth/verify-email/resend', {}, session).expect(204);
    await deliverEmails();
    const tokens = (await emailsWith(email, SUBJECTS.verify)).map((m) =>
      tokenFrom(m.text, '/verify-email'),
    );
    expect(tokens).toHaveLength(2);
    const second = tokens.find((t) => t !== first) ?? '';

    await c.post('/auth/verify-email', { token: first }).expect(422);
    await c.post('/auth/verify-email', { token: second }).expect(204);
  });

  it('tells the owner of an already registered address instead of creating an account', async () => {
    const c = client();
    const email = await register(c);
    await register(c, email.toUpperCase());
    await deliverEmails();

    const subjects = (await mailbox.inbox(email)).map((m) => m.subject).sort();
    expect(subjects).toEqual([SUBJECTS.exists, SUBJECTS.verify].sort());
    expect((await onlyEmailWith(email, SUBJECTS.exists)).text).toContain(
      `${TEST_ORIGIN}/forgot-password`,
    );
    const rows = await testApp.database.db.select().from(users).where(eq(users.email, email));
    expect(rows).toHaveLength(1);
  });
});

describe('password reset', () => {
  it('sets a new password and ends every existing session', async () => {
    const c = client();
    const email = await register(c);
    const oldSession = await login(c, email);

    await c.post('/auth/password-reset/request', { email }).expect(202);
    await deliverEmails();
    const token = tokenFrom((await onlyEmailWith(email, SUBJECTS.reset)).text, '/reset-password');

    const newPassword = 'a brand new passphrase';
    await c.post('/auth/password-reset/confirm', { token, password: newPassword }).expect(204);

    await c.get('/me', oldSession).expect(401);
    await c.post('/auth/login', { email, password: PASSWORD }).expect(401);
    const fresh = await login(c, email, newPassword);
    // The link proved ownership of the address
    expect((await c.get('/me', fresh).expect(200)).body).toMatchObject({ emailVerified: true });

    await c
      .post('/auth/password-reset/confirm', { token, password: 'once more please' })
      .expect(422);
  });

  it('answers the same for an unknown email and sends nothing', async () => {
    const c = client();
    const unknown = newEmail();
    const response = await c.post('/auth/password-reset/request', { email: unknown }).expect(202);
    expect(response.text).toBe('');
    await deliverEmails();
    expect(await mailbox.inbox(unknown)).toEqual([]);
  });
});

describe('profile', () => {
  it('updates name and time zone', async () => {
    const c = client();
    const email = await register(c);
    const session = await login(c, email);

    const response = await c
      .patch('/me', { name: '  Анна Петрова ', timezone: 'Asia/Yekaterinburg' }, session)
      .expect(200);
    expect(response.body).toMatchObject({ name: 'Анна Петрова', timezone: 'Asia/Yekaterinburg' });
  });

  it('rejects an unknown time zone and an empty change', async () => {
    const c = client();
    const session = await login(c, await register(c));

    const bad = await c.patch('/me', { timezone: 'Mars/Base' }, session).expect(400);
    expect(bad.body).toMatchObject({ code: 'VALIDATION_FAILED' });
    await c.patch('/me', {}, session).expect(400);
  });
});
