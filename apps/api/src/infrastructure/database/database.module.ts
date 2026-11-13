import { Global, Inject, Logger, Module, type OnApplicationShutdown } from '@nestjs/common';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { AppConfig } from '../config/config.schema';
import * as schema from './schema';

export type Database = NodePgDatabase<typeof schema>;
/** Transaction handle passed explicitly from services to repositories (ADR-006). */
export type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];
/** What repository methods accept: the pool for single statements or a transaction. */
export type Executor = Database | Tx;

export const DATABASE = Symbol('DATABASE');
const PG_POOL = Symbol('PG_POOL');

export const APPLICATION_NAME = 'slotly-api';

/** Extra time for the server to report its own statement_timeout before the client gives up. */
const CLIENT_TIMEOUT_MARGIN_MS = 1000;

/**
 * Bounded waits (ADR-016): a request gets a connection within connectTimeoutMs or fails with
 * 503, and PostgreSQL itself cancels a statement after statementTimeoutMs, freeing its work.
 * A frozen server cannot cancel anything, so the client stops waiting a little later.
 */
export function createPool(config: AppConfig): Pool {
  const pool = new Pool({
    connectionString: config.databaseUrl,
    // Our connections are recognisable in pg_stat_activity (and in the outage tests)
    application_name: APPLICATION_NAME,
    connectionTimeoutMillis: config.database.connectTimeoutMs,
    statement_timeout: config.database.statementTimeoutMs,
    query_timeout: config.database.statementTimeoutMs + CLIENT_TIMEOUT_MARGIN_MS,
  });
  // An idle client whose server went away (restart, failover) emits 'error' on the pool.
  // Unhandled, it crashes the process; the pool already discards that client and opens
  // a fresh one on the next query, so logging is all that is needed
  const logger = new Logger('DatabasePool');
  pool.on('error', (err) => logger.warn({ err }, 'Idle database connection lost'));
  return pool;
}

@Global()
@Module({
  providers: [
    {
      provide: PG_POOL,
      inject: [AppConfig],
      useFactory: (config: AppConfig) => createPool(config),
    },
    {
      provide: DATABASE,
      inject: [PG_POOL],
      useFactory: (pool: Pool): Database => drizzle(pool, { schema }),
    },
  ],
  exports: [DATABASE],
})
export class DatabaseModule implements OnApplicationShutdown {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
  }
}
