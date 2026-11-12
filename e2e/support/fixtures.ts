import { randomInt, randomUUID } from 'node:crypto';
import { type Browser, type BrowserContext, test as base, expect } from '@playwright/test';

/**
 * A client address of its own for every browser context. All test traffic comes from
 * localhost, so without it the API's per-IP rate limits (10 sign-ins a minute) would be
 * shared by every test. Next.js forwards X-Forwarded-For unchanged and the API trusts the
 * loopback proxy (ADR-005) — the limits stay real, each test is simply another client.
 * No test-only switch exists in the application.
 */
export function clientIp(): string {
  return `10.${randomInt(0, 256)}.${randomInt(0, 256)}.${randomInt(1, 255)}`;
}

/** Unique per test: tests run in parallel against one database (testing.md). */
export function uniqueEmail(who: string): string {
  return `${who}-${randomUUID().slice(0, 8)}@e2e.test`;
}

export function uniqueSlug(prefix: string): string {
  return `${prefix}-${randomUUID().slice(0, 8)}`;
}

export interface CspViolation {
  directive: string;
  blockedURI: string;
  sample: string;
}

/**
 * Content-Security-Policy violations of the running test, from every context it opened.
 * One worker runs one test at a time, so a module-level list per test is enough.
 */
let violations: CspViolation[] = [];

/**
 * Reports every CSP violation in the context's pages to the test. A policy that breaks
 * our own page (a Next.js script without the nonce, a new inline style) fails the test
 * instead of failing silently for users. The listener is installed through DevTools,
 * so the page's CSP does not apply to it.
 */
async function watchCsp(context: BrowserContext): Promise<void> {
  await context.exposeBinding('__reportCspViolation', (_source, v: CspViolation) => {
    violations.push(v);
  });
  await context.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (e) => {
      const report = (window as unknown as Record<string, (v: unknown) => void>)[
        '__reportCspViolation'
      ];
      report?.({ directive: e.effectiveDirective, blockedURI: e.blockedURI, sample: e.sample });
    });
  });
}

/** Another person in the same test (a specialist and a client), with their own address. */
export async function personContext(
  browser: Browser,
  options: { timezoneId?: string } = {},
): Promise<BrowserContext> {
  const context = await browser.newContext({
    extraHTTPHeaders: { 'X-Forwarded-For': clientIp() },
    ...options,
  });
  await watchCsp(context);
  return context;
}

export const test = base.extend<{ cspViolations: CspViolation[] }>({
  // The default `page` of a test is one more person with its own address
  // Playwright reads fixture dependencies from the destructuring, so it must be an object
  // pattern even without dependencies
  // eslint-disable-next-line no-empty-pattern
  extraHTTPHeaders: async ({}, use) => {
    await use({ 'X-Forwarded-For': clientIp() });
  },
  context: async ({ context }, use) => {
    await watchCsp(context);
    await use(context);
  },
  // Every test ends with no CSP violation; a test that provokes one on purpose takes the
  // expected ones out of this list
  cspViolations: [
    // eslint-disable-next-line no-empty-pattern -- see extraHTTPHeaders above
    async ({}, use) => {
      violations = [];
      await use(violations);
      expect(violations, 'Content-Security-Policy violations').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect } from '@playwright/test';
