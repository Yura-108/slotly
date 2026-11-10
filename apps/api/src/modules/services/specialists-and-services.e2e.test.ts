import { randomUUID } from 'node:crypto';
import type { App } from 'supertest/types';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startTestApp, type TestApp } from '../../test-utils/app';
import { httpClient, signedInUser } from '../../test-utils/http';

let testApp: TestApp;
let server: App;

const newSlug = () => `spec-${randomUUID().slice(0, 8)}`;

async function specialist(slug = newSlug()) {
  const user = await signedInUser(server, testApp.database.db);
  const c = httpClient(server, user.session);
  await c.post('/me/specialist-profile', { slug, displayName: 'Ирина Смирнова' }).expect(201);
  return { ...user, c, slug };
}

async function createService(c: ReturnType<typeof httpClient>, durationMinutes = 60) {
  const response = await c
    .post('/me/services', { name: 'Консультация', durationMinutes })
    .expect(201);
  return response.body as { id: string };
}

beforeAll(async () => {
  testApp = await startTestApp();
  server = testApp.app.getHttpServer();
});

afterAll(async () => {
  await testApp?.close();
});

describe('specialist profile', () => {
  it('requires a confirmed email to be enabled (FR-2)', async () => {
    const user = await signedInUser(server, testApp.database.db, { verified: false });
    const response = await httpClient(server, user.session)
      .post('/me/specialist-profile', { slug: newSlug(), displayName: 'Анна' })
      .expect(403);
    expect(response.body).toMatchObject({ code: 'EMAIL_NOT_VERIFIED' });
  });

  it('enables a profile with defaults and the user time zone', async () => {
    const user = await signedInUser(server, testApp.database.db);
    const c = httpClient(server, user.session);
    await c.get('/me/specialist-profile').expect(404);

    const slug = newSlug();
    const created = await c
      .post('/me/specialist-profile', { slug, displayName: '  Ирина  ', bio: 'Психолог' })
      .expect(201);
    expect(created.body).toEqual({
      slug,
      displayName: 'Ирина',
      bio: 'Психолог',
      timezone: 'Europe/Moscow',
      confirmationMode: 'manual',
      minNoticeMinutes: 120,
      bookingHorizonDays: 60,
      clientCancelDeadlineHours: 24,
    });
    await c.get('/me/specialist-profile').expect(200);

    const again = await c
      .post('/me/specialist-profile', { slug: newSlug(), displayName: 'Ирина' })
      .expect(409);
    expect(again.body).toMatchObject({ code: 'SPECIALIST_PROFILE_EXISTS' });
  });

  it('keeps page addresses unique, also on update', async () => {
    const first = await specialist();
    const second = await specialist();

    const taken = await httpClient(
      server,
      (await signedInUser(server, testApp.database.db)).session,
    )
      .post('/me/specialist-profile', { slug: first.slug, displayName: 'Другая' })
      .expect(409);
    expect(taken.body).toMatchObject({ code: 'SLUG_TAKEN' });

    const renamed = await second.c
      .patch('/me/specialist-profile', { slug: first.slug })
      .expect(409);
    expect(renamed.body).toMatchObject({ code: 'SLUG_TAKEN' });
  });

  it('lets exactly one of concurrent requests take a slug', async () => {
    const slug = newSlug();
    const users = await Promise.all(
      Array.from({ length: 5 }, () => signedInUser(server, testApp.database.db)),
    );
    const responses = await Promise.all(
      users.map((u) =>
        httpClient(server, u.session).post('/me/specialist-profile', { slug, displayName: 'X' }),
      ),
    );
    expect(responses.map((r) => r.status).sort()).toEqual([201, 409, 409, 409, 409]);
  });

  it('validates slug format and settings ranges', async () => {
    const user = await signedInUser(server, testApp.database.db);
    const response = await httpClient(server, user.session)
      .post('/me/specialist-profile', {
        slug: 'Not Valid!',
        displayName: '',
        minNoticeMinutes: -1,
        confirmationMode: 'sometimes',
      })
      .expect(400);
    const paths = (response.body as { errors: { path: string }[] }).errors.map((e) => e.path);
    expect(paths.sort()).toEqual(['confirmationMode', 'displayName', 'minNoticeMinutes', 'slug']);
  });

  it('updates booking settings', async () => {
    const { c } = await specialist();
    const response = await c
      .patch('/me/specialist-profile', { confirmationMode: 'auto', minNoticeMinutes: 0 })
      .expect(200);
    expect(response.body).toMatchObject({ confirmationMode: 'auto', minNoticeMinutes: 0 });
  });

  it('shows a public profile without booking settings', async () => {
    const { slug } = await specialist();
    const response = await httpClient(server).get(`/specialists/${slug}`).expect(200);
    expect(response.body).toEqual({
      slug,
      displayName: 'Ирина Смирнова',
      bio: null,
      timezone: 'Europe/Moscow',
    });
    await httpClient(server).get('/specialists/no-such-specialist').expect(404);
  });
});

describe('services', () => {
  it('are managed only by a specialist', async () => {
    const user = await signedInUser(server, testApp.database.db);
    const response = await httpClient(server, user.session).get('/me/services').expect(403);
    expect(response.body).toMatchObject({ code: 'SPECIALIST_PROFILE_REQUIRED' });
  });

  it('validates the duration (FR-20)', async () => {
    const { c } = await specialist();
    for (const durationMinutes of [10, 17, 485]) {
      await c.post('/me/services', { name: 'Сеанс', durationMinutes }).expect(400);
    }
    await c.post('/me/services', { name: 'Сеанс', durationMinutes: 480 }).expect(201);
  });

  it('creates, lists and updates own services', async () => {
    const { c } = await specialist();
    const { id } = await createService(c);

    const updated = await c
      .patch(`/me/services/${id}`, { durationMinutes: 90, description: 'Онлайн' })
      .expect(200);
    expect(updated.body).toMatchObject({ id, durationMinutes: 90, description: 'Онлайн' });

    const list = await c.get('/me/services').expect(200);
    expect(list.body).toMatchObject({ total: 1, items: [{ id, archived: false }] });
  });

  it("treats someone else's service as missing (no IDOR)", async () => {
    const owner = await specialist();
    const other = await specialist();
    const { id } = await createService(owner.c);

    const edit = await other.c.patch(`/me/services/${id}`, { name: 'Чужая' }).expect(404);
    expect(edit.body).toMatchObject({ code: 'NOT_FOUND' });
    await other.c.post(`/me/services/${id}/archive`).expect(404);

    // Indistinguishable from a service that does not exist at all
    const missing = await other.c.patch(`/me/services/${randomUUID()}`, { name: 'X' }).expect(404);
    expect((missing.body as { code: string }).code).toBe((edit.body as { code: string }).code);

    const ownerView = await owner.c.get('/me/services').expect(200);
    expect(ownerView.body).toMatchObject({ items: [{ name: 'Консультация', archived: false }] });
  });

  it('archives instead of deleting; archived services are frozen and hidden publicly', async () => {
    const { c, slug } = await specialist();
    const kept = await createService(c, 30);
    const archived = await createService(c, 60);

    await c.post(`/me/services/${archived.id}/archive`).expect(204);
    await c.post(`/me/services/${archived.id}/archive`).expect(204);

    const edit = await c.patch(`/me/services/${archived.id}`, { name: 'Новое' }).expect(422);
    expect(edit.body).toMatchObject({ code: 'SERVICE_ARCHIVED' });

    const own = await c.get('/me/services').expect(200);
    expect(own.body).toMatchObject({ total: 2 });

    const pub = await httpClient(server).get(`/specialists/${slug}/services`).expect(200);
    expect(pub.body).toEqual({
      total: 1,
      items: [{ id: kept.id, name: 'Консультация', description: null, durationMinutes: 30 }],
    });
  });

  it('rejects a malformed service id', async () => {
    const { c } = await specialist();
    await c.patch('/me/services/not-a-uuid', { name: 'X' }).expect(400);
  });
});
