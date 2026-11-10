import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { outboxMessages } from '../../infrastructure/database/schema';
import { startTestDatabase, type TestDatabase } from '../../test-utils/postgres';
import { LEASE_MS, MAX_ATTEMPTS } from './domain/retry-policy';
import type { MailSender, OutgoingEmail } from './mail-sender';
import { OutboxProcessor } from './outbox.processor';
import { OutboxRepository } from './outbox.repository';

/** Stand-in for the SMTP boundary only; outbox logic and the database are real. */
class FakeMailSender {
  sent: OutgoingEmail[] = [];
  failWith: Error | null = null;

  send(email: OutgoingEmail): Promise<void> {
    if (this.failWith) return Promise.reject(this.failWith);
    this.sent.push(email);
    return Promise.resolve();
  }
}

let database: TestDatabase;
const repository = new OutboxRepository();
let mail: FakeMailSender;
let processor: OutboxProcessor;

const now = new Date('2030-01-01T00:00:00Z');
const later = (ms: number) => new Date(now.getTime() + ms);

async function enqueueVerifyEmail(createdAt = now) {
  const to = `u-${randomUUID().slice(0, 8)}@example.test`;
  const [row] = await database.db
    .insert(outboxMessages)
    .values({
      type: 'auth.verify_email',
      payload: { to, name: 'Анна', link: 'https://slotly.example/verify-email#token=secret' },
      nextAttemptAt: createdAt,
    })
    .returning();
  if (!row) throw new Error('insert failed');
  return row;
}

const load = async (id: string) =>
  (await database.db.select().from(outboxMessages).where(eq(outboxMessages.id, id)))[0];

beforeAll(async () => {
  database = await startTestDatabase();
});

afterAll(async () => {
  await database?.stop();
});

beforeEach(async () => {
  await database.db.delete(outboxMessages);
  mail = new FakeMailSender();
  // The processor only calls send(); the cast keeps the test free of SMTP
  processor = new OutboxProcessor(database.db, repository, mail as unknown as MailSender);
});

describe('outbox claiming', () => {
  it('gives concurrent workers disjoint messages (SKIP LOCKED)', async () => {
    for (let i = 0; i < 25; i++) await enqueueVerifyEmail();

    const batches = await Promise.all(
      Array.from({ length: 5 }, () =>
        repository.claimDue(database.db, { now, leaseUntil: later(LEASE_MS), limit: 10 }),
      ),
    );
    const ids = batches.flat().map((row) => row.id);
    expect(ids).toHaveLength(25);
    expect(new Set(ids).size).toBe(25);
  });

  it('hides a claimed message until its lease expires', async () => {
    const { id } = await enqueueVerifyEmail();
    const claim = (at: Date) =>
      repository.claimDue(database.db, {
        now: at,
        leaseUntil: new Date(at.getTime() + LEASE_MS),
        limit: 10,
      });

    expect((await claim(now)).map((r) => r.id)).toEqual([id]);
    expect(await claim(later(LEASE_MS - 1))).toEqual([]);
    // The worker died mid-send: after the lease the message is claimed again
    const again = await claim(later(LEASE_MS));
    expect(again.map((r) => ({ id: r.id, attempts: r.attempts }))).toEqual([{ id, attempts: 2 }]);
  });

  it('does not claim messages that are not due yet', async () => {
    await enqueueVerifyEmail(later(60_000));
    expect(await processor.processDue(now)).toEqual({ sent: 0, retried: 0, failed: 0 });
  });
});

describe('delivery', () => {
  it('sends, marks sent and removes the one-time link from the stored payload', async () => {
    const { id } = await enqueueVerifyEmail();

    expect(await processor.processDue(now)).toEqual({ sent: 1, retried: 0, failed: 0 });

    expect(mail.sent).toHaveLength(1);
    expect(mail.sent[0]?.messageId).toBe(`<${id}@slotly>`);
    expect(mail.sent[0]?.text).toContain('#token=secret');
    const row = await load(id);
    expect(row?.status).toBe('sent');
    expect(row?.payload).not.toHaveProperty('link');
    expect(row?.payload).toHaveProperty('to');
  });

  it('schedules a retry with backoff when sending fails', async () => {
    const { id } = await enqueueVerifyEmail();
    mail.failWith = Object.assign(new Error('Connection refused'), { code: 'ECONNREFUSED' });

    expect(await processor.processDue(now)).toEqual({ sent: 0, retried: 1, failed: 0 });

    const row = await load(id);
    expect(row).toMatchObject({ status: 'pending', attempts: 1 });
    expect(row?.lastError).toContain('ECONNREFUSED');
    expect(row?.nextAttemptAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('gives up after the last attempt and still scrubs the link', async () => {
    const { id } = await enqueueVerifyEmail();
    await database.db
      .update(outboxMessages)
      .set({ attempts: MAX_ATTEMPTS - 1 })
      .where(eq(outboxMessages.id, id));
    mail.failWith = new Error('550 mailbox unavailable');

    expect(await processor.processDue(now)).toEqual({ sent: 0, retried: 0, failed: 1 });

    const row = await load(id);
    expect(row).toMatchObject({ status: 'failed', attempts: MAX_ATTEMPTS });
    expect(row?.payload).not.toHaveProperty('link');
  });

  it('fails a message whose payload does not match its type, without sending', async () => {
    const [row] = await database.db
      .insert(outboxMessages)
      .values({ type: 'auth.verify_email', payload: { to: 'not-an-email' }, nextAttemptAt: now })
      .returning();

    expect(await processor.processDue(now)).toEqual({ sent: 0, retried: 0, failed: 1 });
    expect(mail.sent).toEqual([]);
    expect((await load(row?.id ?? ''))?.status).toBe('failed');
  });
});
