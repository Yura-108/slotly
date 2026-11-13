import { expect, test } from '../support/fixtures.ts';

const nonceOf = (csp: string | undefined) => /'nonce-([^']+)'/.exec(csp ?? '')?.[1];

test.describe('security headers and Content-Security-Policy (ADR-014)', () => {
  test('every page response has its own nonce, and our scripts carry it', async ({ page }) => {
    const first = await page.goto('/login');
    const second = await page.goto('/login');
    const headers = first!.headers();

    const nonce = nonceOf(headers['content-security-policy']);
    expect(nonce).toBeTruthy();
    expect(nonceOf(second!.headers()['content-security-policy'])).not.toBe(nonce);
    expect(headers['content-security-policy']).not.toContain('unsafe-inline');
    expect(headers['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
    // The e2e stack is a production build
    expect(headers['strict-transport-security']).toContain('max-age=');

    // Next.js marked its scripts with the nonce of the second response (the page shown);
    // the browser hides the attribute value from the DOM, so read the property
    const secondNonce = nonceOf(second!.headers()['content-security-policy']);
    const scriptNonces = await page
      .locator('script')
      .evaluateAll((scripts) => scripts.map((s) => (s as HTMLScriptElement).nonce));
    expect(scriptNonces.length).toBeGreaterThan(0);
    expect(new Set(scriptNonces)).toEqual(new Set([secondNonce]));
    // That the pages still work under the policy is shown by every other scenario: they
    // need hydrated pages, and any blocked script or style fails them through the fixture
  });

  test('markup injected into a page cannot run scripts (the XSS second line)', async ({
    page,
    cspViolations,
  }) => {
    // An XSS is attacker markup in the HTML our server sends (say, a name that escaped
    // React). The real page response is served with its headers, plus an inline script
    // and an event handler — the way such markup would actually reach the browser
    const injected =
      `<script>window.__pwned = 'script'</script>` +
      `<img src="/no-such-image" onerror="window.__pwned = 'img'">`;
    await page.route('/', async (route) => {
      const response = await route.fetch();
      const html = (await response.text()).replace('</body>', `${injected}</body>`);
      await route.fulfill({ response, body: html });
    });
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    await expect
      .poll(() => cspViolations.map((v) => v.directive).sort())
      .toEqual(['script-src-attr', 'script-src-elem']);
    expect(await page.evaluate(() => (window as { __pwned?: string }).__pwned)).toBeUndefined();
    // Expected violations: taken out, so the fixture's "no violations" check passes
    cspViolations.length = 0;
  });

  test('API responses through the web proxy keep the API policy', async ({ request }) => {
    const res = await request.get('/api/health/live');
    expect(res.ok()).toBe(true);
    const headers = res.headers();
    expect(headers['cache-control']).toBe('no-store');
    expect(headers['referrer-policy']).toBe('no-referrer');
    expect(headers['content-security-policy']).toBe("default-src 'none'; frame-ancestors 'none'");
  });
});
