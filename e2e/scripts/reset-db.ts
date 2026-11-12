/**
 * Recreates the e2e database and applies the API migrations. Runs as the first step of the
 * API web server command, so the schema is ready before the API accepts requests.
 */
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { E2E } from '../support/env.ts';

const admin = new pg.Client({ connectionString: E2E.adminDatabaseUrl });
await admin.connect();
try {
  // WITH (FORCE) closes leftover connections of an interrupted previous run
  await admin.query(`drop database if exists ${E2E.databaseName} with (force)`);
  await admin.query(`create database ${E2E.databaseName}`);
} finally {
  await admin.end();
}

const apiDir = fileURLToPath(new URL('../../apps/api/', import.meta.url));
execFileSync('pnpm', ['exec', 'drizzle-kit', 'migrate'], {
  cwd: apiDir,
  env: { ...process.env, DATABASE_URL: E2E.databaseUrl },
  stdio: 'inherit',
  shell: process.platform === 'win32',
});
console.log(`e2e database ${E2E.databaseName} is ready`);
