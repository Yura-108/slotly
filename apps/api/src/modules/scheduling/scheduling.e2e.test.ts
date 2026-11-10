import { randomUUID } from 'node:crypto';
import type { App } from 'supertest/types';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PgErrorCode, pgErrorCode } from '../../infrastructure/database/pg-errors';
import { weeklyAvailability } from '../../infrastructure/database/schema';
import { startTestApp, type TestApp } from '../../test-utils/app';
import { httpClient, signedInUser } from '../../test-utils/http';

let testApp: TestApp;
let server: App;

async function specialist() {
  const user = await signedInUser(server, testApp.database.db);
  const c = httpClient(server, user.session);
  await c
    .post('/me/specialist-profile', {
      slug: `spec-${randomUUID().slice(0, 8)}`,
      displayName: 'Ирина',
      timezone: 'Europe/Berlin',
    })
    .expect(201);
  return { ...user, c };
}

const put = (c: ReturnType<typeof httpClient>, intervals: object[]) =>
  c.put('/me/availability', { intervals });

beforeAll(async () => {
  testApp = await startTestApp();
  server = testApp.app.getHttpServer();
});

afterAll(async () => {
  await testApp?.close();
});

describe('weekly schedule', () => {
  it('is managed only by a specialist', async () => {
    const user = await signedInUser(server, testApp.database.db);
    const response = await httpClient(server, user.session).get('/me/availability').expect(403);
    expect(response.body).toMatchObject({ code: 'SPECIALIST_PROFILE_REQUIRED' });
  });

  it('replaces the whole week and returns it sorted in the specialist time zone', async () => {
    const { c } = await specialist();
    const week = [
      { weekday: 3, start: '10:00', end: '18:00' },
      { weekday: 1, start: '14:00', end: '18:00' },
      { weekday: 1, start: '09:00', end: '13:00' },
      { weekday: 5, start: '20:00', end: '24:00' },
    ];

    const saved = await put(c, week).expect(200);
    expect(saved.body).toEqual({
      timezone: 'Europe/Berlin',
      intervals: [
        { weekday: 1, start: '09:00', end: '13:00' },
        { weekday: 1, start: '14:00', end: '18:00' },
        { weekday: 3, start: '10:00', end: '18:00' },
        { weekday: 5, start: '20:00', end: '24:00' },
      ],
    });
    expect((await c.get('/me/availability').expect(200)).body).toEqual(saved.body);

    // A new week replaces the old one entirely
    await put(c, [{ weekday: 2, start: '10:00', end: '11:00' }]).expect(200);
    const replaced = await c.get('/me/availability').expect(200);
    expect(replaced.body).toMatchObject({ intervals: [{ weekday: 2, start: '10:00' }] });

    await put(c, []).expect(200);
    expect((await c.get('/me/availability').expect(200)).body).toMatchObject({ intervals: [] });
  });

  it('allows touching intervals but rejects overlapping ones with the exact path', async () => {
    const { c } = await specialist();
    await put(c, [
      { weekday: 1, start: '10:00', end: '12:00' },
      { weekday: 1, start: '12:00', end: '14:00' },
    ]).expect(200);

    const overlap = await put(c, [
      { weekday: 1, start: '10:00', end: '14:00' },
      { weekday: 2, start: '10:00', end: '14:00' },
      { weekday: 1, start: '13:00', end: '15:00' },
    ]).expect(400);
    expect(overlap.body).toMatchObject({
      code: 'VALIDATION_FAILED',
      errors: [{ path: 'intervals.2' }],
    });
    // The rejected request changed nothing
    const kept = await c.get('/me/availability').expect(200);
    expect((kept.body as { intervals: unknown[] }).intervals).toHaveLength(2);
  });

  it('validates times and order inside an interval', async () => {
    const { c } = await specialist();
    const response = await put(c, [
      { weekday: 1, start: '18:00', end: '10:00' },
      { weekday: 8, start: '25:00', end: '26:00' },
    ]).expect(400);
    const paths = (response.body as { errors: { path: string }[] }).errors.map((e) => e.path);
    expect(paths).toEqual(
      expect.arrayContaining(['intervals.0.end', 'intervals.1.weekday', 'intervals.1.start']),
    );
  });

  it('serializes concurrent saves: one complete week wins, never a mix or an error', async () => {
    const { c } = await specialist();
    const weeks = Array.from({ length: 6 }, (_, k) => [
      { weekday: 1, start: `0${k}:00`, end: `0${k}:30` },
      { weekday: 2, start: `1${k}:00`, end: `1${k}:30` },
    ]);
    const responses = await Promise.all(weeks.map((week) => put(c, week)));
    expect(responses.map((r) => r.status)).toEqual(weeks.map(() => 200));

    const final = (await c.get('/me/availability').expect(200)).body as {
      intervals: { weekday: number; start: string; end: string }[];
    };
    expect(weeks).toContainEqual(final.intervals);
  });

  it('is backed by an exclusion constraint in the database', async () => {
    const { userId } = await specialist();
    const row = { specialistId: userId, weekday: 4, startMinute: 600, endMinute: 720 };
    await testApp.database.db.insert(weeklyAvailability).values(row);
    const error = await testApp.database.db
      .insert(weeklyAvailability)
      .values({ ...row, startMinute: 660, endMinute: 780 })
      .catch((e: unknown) => e);
    expect(pgErrorCode(error)).toBe(PgErrorCode.exclusionViolation);
  });
});

describe('days off', () => {
  it('adds, lists and removes own days off', async () => {
    const { c } = await specialist();
    const added = await c.post('/me/days-off', { date: '2099-01-15' }).expect(201);
    await c.post('/me/days-off', { date: '2099-01-10' }).expect(201);

    const list = await c.get('/me/days-off').expect(200);
    expect(list.body).toMatchObject({
      total: 2,
      items: [{ date: '2099-01-10' }, { date: '2099-01-15' }],
    });

    const id = (added.body as { id: string }).id;
    await c.delete(`/me/days-off/${id}`).expect(204);
    await c.delete(`/me/days-off/${id}`).expect(404);
  });

  it('rejects duplicates, past dates and impossible dates', async () => {
    const { c } = await specialist();
    await c.post('/me/days-off', { date: '2099-03-01' }).expect(201);

    const duplicate = await c.post('/me/days-off', { date: '2099-03-01' }).expect(409);
    expect(duplicate.body).toMatchObject({ code: 'DAY_OFF_EXISTS' });
    const past = await c.post('/me/days-off', { date: '2000-01-01' }).expect(422);
    expect(past.body).toMatchObject({ code: 'DAY_OFF_IN_PAST' });
    await c.post('/me/days-off', { date: '2099-02-30' }).expect(400);
  });

  it("treats someone else's day off as missing", async () => {
    const owner = await specialist();
    const other = await specialist();
    const added = await owner.c.post('/me/days-off', { date: '2099-05-05' }).expect(201);

    await other.c.delete(`/me/days-off/${(added.body as { id: string }).id}`).expect(404);
    expect((await owner.c.get('/me/days-off').expect(200)).body).toMatchObject({ total: 1 });
  });
});
