import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';

/** WCAG 2.1 levels A and AA — what accessibility laws and procurement usually require. */
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

/**
 * Fails on any WCAG A/AA violation axe can detect on the current page. Automated checks
 * find roughly a third of real problems (missing labels, contrast, roles, headings);
 * keyboard use and screen-reader wording still need a person.
 */
export async function expectAccessible(page: Page): Promise<void> {
  const { violations } = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  const report = violations.map((v) => ({
    rule: v.id,
    impact: v.impact,
    help: v.help,
    targets: v.nodes.slice(0, 5).map((n) => n.target.join(' ')),
  }));
  expect(report, `accessibility violations on ${page.url()}`).toEqual([]);
}
