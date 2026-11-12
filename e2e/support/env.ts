/**
 * The isolated stack Playwright starts for a run (docs/architecture/testing.md): its own
 * database and ports, so dev servers and dev data are left alone. Local compose values
 * (compose.yaml); override with environment variables if yours differ.
 */
const env = process.env;

export const E2E = {
  apiPort: 4100,
  webPort: 3100,
  apiUrl: 'http://localhost:4100',
  webUrl: 'http://localhost:3100',
  /** Superuser connection used only to drop and create the e2e database. */
  adminDatabaseUrl:
    env['E2E_ADMIN_DATABASE_URL'] ?? 'postgres://slotly:slotly@localhost:55432/postgres',
  databaseName: 'slotly_e2e',
  databaseUrl: env['E2E_DATABASE_URL'] ?? 'postgres://slotly:slotly@localhost:55432/slotly_e2e',
  smtpUrl: env['E2E_SMTP_URL'] ?? 'smtp://localhost:1025',
  mailpitUrl: env['E2E_MAILPIT_URL'] ?? 'http://localhost:8025',
  /** Test accounts only exist in the e2e database; the value comes from here, not from chat. */
  password: 'e2e correct horse battery',
} as const;
