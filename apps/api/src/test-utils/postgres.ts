import { join } from 'node:path';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import type { Database } from '../infrastructure/database/database.module';
import { composeImage } from './compose-image';
import * as schema from '../infrastructure/database/schema';

export interface TestDatabase {
  db: Database;
  /** For starting the whole app against the same database (e2e tests). */
  connectionUri: string;
  /** Docker id of the container: outage tests pause it to freeze the server. */
  containerId: string;
  stop: () => Promise<void>;
}

/**
 * Real PostgreSQL in a throwaway container with all migrations applied.
 * Same image as compose.yaml, so tests see production-like behaviour
 * (exclusion constraints, locking) that mocks cannot reproduce.
 */
export async function startTestDatabase(): Promise<TestDatabase> {
  const container: StartedPostgreSqlContainer = await new PostgreSqlContainer(
    composeImage('postgres'),
  ).start();
  // Enough connections for concurrency tests that open many transactions at once
  const pool = new Pool({ connectionString: container.getConnectionUri(), max: 30 });
  // Outage tests break connections on purpose; the test pool must survive that too
  pool.on('error', () => undefined);
  const db = drizzle(pool, { schema });
  await migrate(db, { migrationsFolder: join(__dirname, '../../drizzle') });

  return {
    db,
    connectionUri: container.getConnectionUri(),
    containerId: container.getId(),
    stop: async () => {
      await pool.end();
      await container.stop();
    },
  };
}
