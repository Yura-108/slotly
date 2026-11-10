import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PgErrorCode, pgErrorCode } from '../../infrastructure/database/pg-errors';
import { startTestDatabase, type TestDatabase } from '../../test-utils/postgres';
import { UsersRepository } from './users.repository';

let database: TestDatabase;
const repository = new UsersRepository();

const user = (email: string) => ({
  email,
  passwordHash: 'not-a-real-hash',
  name: 'Test',
  timezone: 'UTC',
});

beforeAll(async () => {
  database = await startTestDatabase();
});

afterAll(async () => {
  await database?.stop();
});

describe('UsersRepository', () => {
  it('reports a taken email as a result, not an exception', async () => {
    const email = `u-${randomUUID()}@example.test`;
    expect(await repository.insert(database.db, user(email))).toMatchObject({
      status: 'created',
    });
    expect(await repository.insert(database.db, user(email))).toEqual({ status: 'email_taken' });
  });

  it('lets exactly one of concurrent registrations of one email win', async () => {
    const email = `race-${randomUUID()}@example.test`;
    const results = await Promise.all(
      Array.from({ length: 10 }, () => repository.insert(database.db, user(email))),
    );
    expect(results.filter((r) => r.status === 'created')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'email_taken')).toHaveLength(9);
  });

  it('keeps the surrounding transaction usable after a taken email', async () => {
    const email = `tx-${randomUUID()}@example.test`;
    await repository.insert(database.db, user(email));

    const found = await database.db.transaction(async (tx) => {
      expect(await repository.insert(tx, user(email))).toEqual({ status: 'email_taken' });
      // With a caught 23505 instead of ON CONFLICT this would fail: "transaction is aborted"
      return repository.findByEmail(tx, email);
    });
    expect(found?.email).toBe(email);
  });

  it('refuses a non-normalized email at the database level', async () => {
    const error = await repository
      .insert(database.db, user(`Mixed-${randomUUID()}@Example.test`))
      .catch((e: unknown) => e);
    expect(pgErrorCode(error)).toBe(PgErrorCode.checkViolation);
  });
});
