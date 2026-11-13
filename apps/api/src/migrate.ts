import { join } from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { loadEnvFileIfPresent, loadMigrationConfig } from './infrastructure/config/config.schema';

/**
 * Applies the SQL migrations of apps/api/drizzle — the production way (`node dist/migrate.js`
 * in the API image, ADR-018). A separate step before the new version starts, not part of
 * startup: several instances would race to change the schema, and the serving process
 * should not need DDL rights. drizzle-kit (a dev dependency) is not in the image; this is
 * the same drizzle-orm migrator the tests use, with the same bookkeeping table.
 */
async function main(): Promise<void> {
  loadEnvFileIfPresent();
  const { databaseUrl } = loadMigrationConfig();
  const pool = new Pool({
    connectionString: databaseUrl,
    max: 1,
    application_name: 'slotly-migrate',
  });
  try {
    await migrate(drizzle(pool), { migrationsFolder: join(__dirname, '..', 'drizzle') });
    console.log('Migrations applied');
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error('Migration failed:', error);
  process.exitCode = 1;
});
