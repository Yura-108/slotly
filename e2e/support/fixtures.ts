import { randomInt, randomUUID } from 'node:crypto';
import { type Browser, type BrowserContext, test as base } from '@playwright/test';

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

/** Another person in the same test (a specialist and a client), with their own address. */
export async function personContext(
  browser: Browser,
  options: { timezoneId?: string } = {},
): Promise<BrowserContext> {
  return browser.newContext({
    extraHTTPHeaders: { 'X-Forwarded-For': clientIp() },
    ...options,
  });
}

export const test = base.extend({
  // The default `page` of a test is one more person with its own address
  // Playwright reads fixture dependencies from the destructuring, so it must be an object
  // pattern even without dependencies
  // eslint-disable-next-line no-empty-pattern
  extraHTTPHeaders: async ({}, use) => {
    await use({ 'X-Forwarded-For': clientIp() });
  },
});

export { expect } from '@playwright/test';
