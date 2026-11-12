import type { Page } from '@playwright/test';
import { freeSlots, signIn, specialist, verifiedPerson } from '../support/api.ts';
import { expectAccessible } from '../support/a11y.ts';
import { E2E } from '../support/env.ts';
import { expect, personContext, test } from '../support/fixtures.ts';

/** Every page checked as it is shown to a person: loaded, with dynamic parts rendered. */
test.describe('accessibility (WCAG 2.1 A/AA, axe)', () => {
  test('public pages', async ({ page }) => {
    const irina = await specialist();

    for (const path of ['/', '/login', '/register', '/forgot-password']) {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expectAccessible(page);
    }

    // The booking page with the slot grid and a chosen slot
    await page.goto(`/book/${irina.slug}`);
    await page.locator('button[aria-pressed]').first().click();
    await expect(page.getByRole('link', { name: 'Войдите' })).toBeVisible();
    await expectAccessible(page);
  });

  test("a specialist's pages", async ({ browser }) => {
    const irina = await specialist();
    const anna = await verifiedPerson('Анна');
    const [slot] = await freeSlots(irina);
    await anna.api.call('POST', '/bookings', { serviceId: irina.serviceId, startAt: slot!.start });

    const context = await personContext(browser, { timezoneId: 'Europe/Berlin' });
    await signIn(context, irina);
    const page = await context.newPage();
    const visit = async (path: string, ready: (p: Page) => Promise<void>) => {
      await page.goto(path);
      await ready(page);
      await expectAccessible(page);
    };

    await visit('/specialist/settings', (p) =>
      expect(p.getByLabel('Имя на странице')).toHaveValue('Ирина Смирнова'),
    );
    await visit('/specialist/services', (p) => expect(p.getByText('Консультация')).toBeVisible());
    await visit('/specialist/schedule', (p) =>
      expect(p.getByLabel('Понедельник: начало')).toHaveValue('09:00'),
    );
    await visit('/bookings?as=specialist', (p) =>
      expect(p.getByRole('heading', { name: 'Ждут ответа (1)' })).toBeVisible(),
    );
    // The reason form of a rejection
    await page.getByRole('button', { name: 'Отклонить' }).click();
    await expectAccessible(page);
    await context.close();
  });

  test("a client's pages", async ({ browser }) => {
    const irina = await specialist();
    const anna = await verifiedPerson('Анна');
    const [slot] = await freeSlots(irina);
    await anna.api.call('POST', '/bookings', { serviceId: irina.serviceId, startAt: slot!.start });

    const context = await personContext(browser);
    await signIn(context, anna);
    const page = await context.newPage();
    for (const path of ['/bookings', '/profile']) {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expectAccessible(page);
    }
    await context.close();
  });

  // axe cannot tell whether the site works without a mouse: a person checks that, and so
  // does this test — sign in and book with the keyboard only
  test('signing in and booking work with the keyboard alone', async ({ page }) => {
    const irina = await specialist({ confirmationMode: 'auto' });
    const anna = await verifiedPerson('Анна');

    await page.goto(`/login?next=/book/${irina.slug}`);
    await page.getByLabel('Email').focus();
    await page.keyboard.type(anna.email);
    await page.keyboard.press('Tab');
    await page.keyboard.type(E2E.password);
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(new RegExp(`/book/${irina.slug}$`));

    // Focus the first slot from the week navigation, choose it with Space, book with Enter
    const firstSlot = page.locator('button[aria-pressed]').first();
    await firstSlot.focus();
    await page.keyboard.press('Space');
    await expect(firstSlot).toHaveAttribute('aria-pressed', 'true');
    const book = page.getByRole('button', { name: 'Записаться' });
    await book.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByText('Вы записаны: Консультация')).toBeVisible();
  });
});
