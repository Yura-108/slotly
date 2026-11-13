import { execFile } from 'node:child_process';
import type { AddressInfo } from 'node:net';
import { connect } from 'node:net';
import { promisify } from 'node:util';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startTestApp, type TestApp } from '../../test-utils/app';
import { httpClient } from '../../test-utils/http';
import { APPLICATION_NAME } from '../database/database.module';
import { HTTP_LIMITS } from './http-limits';

const docker = promisify(execFile);

/**
 * Behaviour under failure (ADR-016): the database goes away or freezes, a client is slow
 * or sends too much. Short database timeouts keep the test fast; the mechanism is the same.
 */
const CONNECT_TIMEOUT_MS = 500;
const STATEMENT_TIMEOUT_MS = 1000;
/** Worst case of a request while the database is frozen: statement + client margin. */
const FAIL_FAST_MS = STATEMENT_TIMEOUT_MS + 1000 + 1500;

let testApp: TestApp;
const server = () => testApp.app.getHttpServer();
const client = () => httpClient(server());

beforeAll(async () => {
  testApp = await startTestApp({
    env: {
      DB_CONNECT_TIMEOUT_MS: String(CONNECT_TIMEOUT_MS),
      DB_STATEMENT_TIMEOUT_MS: String(STATEMENT_TIMEOUT_MS),
    },
  });
  // A real listening socket: the slow-client test talks raw TCP
  await testApp.app.listen(0, '127.0.0.1');
}, 120_000);

afterAll(async () => {
  await testApp.close();
});

async function timed<T>(action: () => PromiseLike<T>): Promise<{ result: T; ms: number }> {
  const start = performance.now();
  const result = await action();
  return { result, ms: performance.now() - start };
}

/** Warms the pool: several connections stay idle afterwards. */
async function openIdleConnections() {
  await Promise.all(Array.from({ length: 4 }, () => client().get('/health/ready').expect(200)));
}

describe('the database goes away', () => {
  it('survives the server closing idle connections (restart, failover) and reconnects', async () => {
    await openIdleConnections();
    // What a PostgreSQL restart does to every connection; unhandled, the pool's 'error'
    // event would crash the process
    const killed = await testApp.database.db.execute<{ terminated: boolean }>(
      sql`select pg_terminate_backend(pid) as terminated from pg_stat_activity
          where application_name = ${APPLICATION_NAME}`,
    );
    expect(killed.rows.length).toBeGreaterThan(0);
    // Let the termination notices reach the idle clients
    await new Promise((resolve) => setTimeout(resolve, 200));

    await client().get('/health/ready').expect(200, { status: 'ok' });
  });

  it('answers 503 fast while the database is frozen, keeps liveness, and recovers', async () => {
    await openIdleConnections();
    await docker('docker', ['pause', testApp.database.containerId]);
    try {
      // A query on an idle connection and a request for a new one both stop waiting
      const ready = await timed(() => client().get('/health/ready'));
      expect(ready.result.status).toBe(503);
      expect(ready.result.headers['content-type']).toContain('application/problem+json');
      expect(ready.result.headers['retry-after']).toBe('30');
      expect(ready.result.body).toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
      expect(ready.ms).toBeLessThan(FAIL_FAST_MS);

      const domain = await timed(() => client().get('/specialists/anyone'));
      expect(domain.result.status).toBe(503);
      expect(domain.ms).toBeLessThan(FAIL_FAST_MS);

      // Liveness does not depend on the database: no restart loop during the outage
      const live = await timed(() => client().get('/health/live').expect(200));
      expect(live.ms).toBeLessThan(500);
    } finally {
      await docker('docker', ['unpause', testApp.database.containerId]);
    }

    // No restart needed: the pool replaces the connections that timed out
    await expect
      .poll(async () => (await client().get('/health/ready')).status, { timeout: 15_000 })
      .toBe(200);
  }, 30_000);
});

describe('a client sends too much or too slowly', () => {
  it('refuses a body over the limit with Problem Details 413', async () => {
    const response = await client()
      .post('/auth/login', { email: 'a@example.test', password: 'x'.repeat(40 * 1024) })
      .expect(413);
    expect(response.headers['content-type']).toContain('application/problem+json');
    expect(response.body).toMatchObject({ code: 'PAYLOAD_TOO_LARGE' });
  });

  it('drops a connection whose headers never finish (slowloris) after headersTimeout', async () => {
    const { port } = server().address() as AddressInfo;
    const { result: firstLine, ms } = await timed(
      () =>
        new Promise<string>((resolve, reject) => {
          const socket = connect(port, '127.0.0.1', () => {
            // Headers are started and never finished
            socket.write('GET /health/live HTTP/1.1\r\nHost: slotly\r\n');
          });
          let data = '';
          socket.on('data', (chunk: Buffer) => (data += chunk.toString()));
          socket.on('close', () => resolve(data.split('\r\n')[0] ?? ''));
          socket.on('error', reject);
        }),
    );
    expect(firstLine).toBe('HTTP/1.1 408 Request Timeout');
    // Node checks timeouts every connectionsCheckingInterval: by default that adds up to 30 s
    expect(ms).toBeGreaterThanOrEqual(HTTP_LIMITS.headersTimeoutMs - 100);
    expect(ms).toBeLessThan(
      HTTP_LIMITS.headersTimeoutMs + HTTP_LIMITS.connectionsCheckingIntervalMs + 1000,
    );
  }, 30_000);
});
