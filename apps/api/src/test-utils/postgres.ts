import { join } from 'node:path';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import type { Database } from '../infrastructure/database/database.module';
import * as schema from '../infrastructure/database/schema';

export interface TestDatabase {
  db: Database;
  /** For starting the whole app against the same database (e2e tests). */
  connectionUri: string;
  stop: () => Promise<void>;
}

/**
 * Real PostgreSQL in a throwaway container with all migrations applied.
 * Same image as compose.yaml, so tests see production-like behaviour
 * (exclusion constraints, locking) that mocks cannot reproduce.
 */
export async function startTestDatabase(): Promise<TestDatabase> {
  const container: StartedPostgreSqlContainer = await new PostgreSqlContainer(
    'postgres:18.6-alpine',
  ).start();
  // Enough connections for concurrency tests that open many transactions at once
  const pool = new Pool({ connectionString: container.getConnectionUri(), max: 30 });
  const db = drizzle(pool, { schema });
  await migrate(db, { migrationsFolder: join(__dirname, '../../drizzle') });

  return {
    db,
    connectionUri: container.getConnectionUri(),
    stop: async () => {
      await pool.end();
      await container.stop();
    },
  };
}
