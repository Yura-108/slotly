import { defineConfig, devices } from '@playwright/test';
import { E2E } from './support/env.ts';

const ci = Boolean(process.env['CI']);
/** Local iteration: keep servers you started yourself (`E2E_REUSE_SERVERS=1`). */
const reuse = process.env['E2E_REUSE_SERVERS'] === '1';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: ci,
  // A retry tells a flaky test (failed, then passed) from a broken one and keeps the trace of
  // the failed attempt. A flaky test still fails the run: it hides either a test that depends
  // on timing or a real race in the app, and a green check would bury both (ADR-017)
  retries: ci ? 1 : 0,
  failOnFlakyTests: ci,
  reporter: [['list'], ['html', { open: 'never' }]],
  timeout: 30_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: E2E.webUrl,
    locale: 'ru-RU',
    timezoneId: 'Europe/Moscow',
    // Evidence for a failure, kept only when a test fails (CI will upload it, stage 8)
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  // The whole system as in production, isolated from dev: own database and ports
  webServer: [
    {
      name: 'api',
      command:
        'node scripts/reset-db.ts && pnpm --filter @slotly/api build && node ../apps/api/dist/main.js',
      // Ready, not just alive: the first test needs the database
      url: `${E2E.apiUrl}/health/ready`,
      reuseExistingServer: reuse,
      timeout: 180_000,
      stdout: 'ignore',
      stderr: 'pipe',
      env: {
        PORT: String(E2E.apiPort),
        DATABASE_URL: E2E.databaseUrl,
        APP_ORIGIN: E2E.webUrl,
        LOG_LEVEL: 'warn',
        LOG_FORMAT: 'json',
        SESSION_COOKIE_NAME: '__Host-session',
        COOKIE_SECURE: 'true',
        TRUSTED_PROXY: 'loopback',
        SMTP_URL: E2E.smtpUrl,
        EMAIL_FROM: 'Slotly E2E <no-reply@slotly.test>',
        OUTBOX_POLL_INTERVAL_MS: '250',
        // Jobs that depend on the clock run explicitly in API tests, not here
        BOOKING_EXPIRY_INTERVAL_MS: '0',
        CLEANUP_INTERVAL_MS: '0',
      },
    },
    {
      name: 'web',
      // Rewrites are resolved at build time (ADR-005): build against the e2e API, into its
      // own directory so the dev server's .next is left alone
      command: 'pnpm exec next build && pnpm exec next start --port 3100',
      cwd: '../apps/web',
      url: E2E.webUrl,
      reuseExistingServer: reuse,
      timeout: 300_000,
      stdout: 'ignore',
      stderr: 'pipe',
      env: { API_INTERNAL_URL: E2E.apiUrl, NEXT_DIST_DIR: '.next-e2e' },
    },
  ],
});
