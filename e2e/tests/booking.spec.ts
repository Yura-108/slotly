import type { Page } from '@playwright/test';
import { freeSlots, signIn, specialist, verifiedPerson } from '../support/api.ts';
import { expect, personContext, test } from '../support/fixtures.ts';
import { waitForLetter } from '../support/mailpit.ts';

/** Slot buttons on the public page (they carry aria-pressed: selected or not). */
const slotButtons = (page: Page) => page.locator('button[aria-pressed]');

test('a client books, the specialist confirms, the client sees it confirmed', async ({
  browser,
}) => {
  const irina = await specialist();
  const anna = await verifiedPerson('Анна');

  const clientContext = await personContext(browser);
  await signIn(clientContext, anna);
  const client = await clientContext.newPage();
  await client.goto(`/book/${irina.slug}`);
  await expect(slotButtons(client).first()).toBeVisible();
  const before = await slotButtons(client).count();

  await slotButtons(client).first().click();
  await client.getByRole('button', { name: 'Записаться' }).click();
  await expect(client.getByText('Заявка отправлена: Консультация')).toBeVisible();
  // The grid is reloaded: the booked time is no longer offered
  await expect(slotButtons(client)).toHaveCount(before - 1);

  // The specialist lands on requests after sign-in (/start) and answers
  const specialistContext = await personContext(browser, { timezoneId: 'Europe/Berlin' });
  await signIn(specialistContext, irina);
  const desk = await specialistContext.newPage();
  await desk.goto('/start');
  await expect(desk).toHaveURL(/\/bookings\?as=specialist$/);
  await expect(desk.getByRole('heading', { name: 'Ждут ответа (1)' })).toBeVisible();
  const request = desk.getByRole('listitem').filter({ hasText: 'Анна' });
  await expect(request.getByText('Ждёт вашего ответа')).toBeVisible();
  await request.getByRole('button', { name: 'Подтвердить' }).click();
  await expect(desk.getByRole('heading', { name: 'Подтверждённые' })).toBeVisible();
  await expect(request.getByText('Подтверждена')).toBeVisible();

  await client.goto('/bookings');
  await expect(client.getByText('Подтверждена')).toBeVisible();
  // The first free slot may start within the 24-hour cancellation deadline: both are right
  await expect(
    client.getByText(/Отменить самостоятельно можно до|Самостоятельная отмена была возможна до/),
  ).toBeVisible();
  await waitForLetter(anna.email, 'Запись подтверждена');

  await clientContext.close();
  await specialistContext.close();
});

test('two clients choose the same time: one books it, the other is told and offered the rest', async ({
  browser,
}) => {
  const irina = await specialist({ confirmationMode: 'auto' });
  const [anna, boris] = await Promise.all([verifiedPerson('Анна'), verifiedPerson('Борис')]);

  const pages: Page[] = [];
  for (const person of [anna, boris]) {
    const context = await personContext(browser);
    await signIn(context, person);
    const page = await context.newPage();
    await page.goto(`/book/${irina.slug}`);
    await expect(slotButtons(page).first()).toBeVisible();
    pages.push(page);
  }
  const [first, second] = pages as [Page, Page];
  const time = await slotButtons(second).first().textContent();

  await slotButtons(first).first().click();
  await first.getByRole('button', { name: 'Записаться' }).click();
  await expect(first.getByText('Вы записаны: Консультация')).toBeVisible();

  // Boris still sees the old grid and picks the same time
  await slotButtons(second).first().click();
  await second.getByRole('button', { name: 'Записаться' }).click();
  await expect(
    second.getByText('Выбранное время только что забронировали. Выберите другой слот.'),
  ).toBeVisible();
  await expect(slotButtons(second).first()).not.toHaveText(time ?? '');

  for (const page of pages) await page.context().close();
});

test("slots are shown on the client's clock, whatever the specialist's zone", async ({
  browser,
}) => {
  const irina = await specialist(); // Berlin
  const zone = 'Asia/Vladivostok';
  const context = await personContext(browser, { timezoneId: zone });
  const page = await context.newPage();
  await page.goto(`/book/${irina.slug}`);
  await expect(page.getByText(`Время указано в вашем часовом поясе: ${zone}.`)).toBeVisible();
  await expect(slotButtons(page).first()).toBeVisible();

  // What the page shows for each day…
  const shown = await page.locator('main section > ul > li').evaluateAll((days) =>
    days.map((day) => ({
      day: day.querySelector('p')?.textContent?.toLowerCase() ?? '',
      times: [...day.querySelectorAll('button')].map((b) => b.textContent ?? ''),
    })),
  );
  // …must be exactly the API's instants on the client's clock. Computed from the API, not
  // as "+9 hours": that offset changes when Berlin switches to summer time
  const day = new Intl.DateTimeFormat('ru-RU', {
    timeZone: zone,
    weekday: 'short',
    day: 'numeric',
    month: 'long',
  });
  const time = new Intl.DateTimeFormat('ru-RU', {
    timeZone: zone,
    hour: '2-digit',
    minute: '2-digit',
  });
  const expected = new Map<string, string[]>();
  for (const slot of await freeSlots(irina)) {
    const key = day.format(new Date(slot.start)).toLowerCase();
    expected.set(key, [...(expected.get(key) ?? []), time.format(new Date(slot.start))]);
  }

  const withSlots = shown.filter((d) => d.times.length > 0);
  expect(withSlots.length).toBeGreaterThan(0);
  for (const { day: label, times } of withSlots) expect(times).toEqual(expected.get(label));
  // Berlin's working day 09:00–17:00 crosses midnight in Vladivostok
  expect(withSlots.flatMap((d) => d.times)).toContain('00:00');

  await context.close();
});

test('the specialist rejects with a reason; the client withdraws another request', async ({
  browser,
}) => {
  const irina = await specialist();
  const anna = await verifiedPerson('Анна');
  const slots = await freeSlots(irina);
  for (const slot of [slots[0], slots[3]]) {
    await anna.api.call('POST', '/bookings', { serviceId: irina.serviceId, startAt: slot!.start });
  }

  const specialistContext = await personContext(browser, { timezoneId: 'Europe/Berlin' });
  await signIn(specialistContext, irina);
  const desk = await specialistContext.newPage();
  await desk.goto('/bookings?as=specialist');
  await expect(desk.getByRole('heading', { name: 'Ждут ответа (2)' })).toBeVisible();
  const firstRequest = desk.getByRole('listitem').filter({ hasText: 'Анна' }).first();
  await firstRequest.getByRole('button', { name: 'Отклонить' }).click();
  await firstRequest.getByLabel('Причина (необязательно) — её увидит клиент').fill('Заболела');
  await firstRequest.getByRole('button', { name: 'Отклонить заявку' }).click();
  await expect(desk.getByRole('heading', { name: 'Ждут ответа (1)' })).toBeVisible();

  const clientContext = await personContext(browser);
  await signIn(clientContext, anna);
  const client = await clientContext.newPage();
  await client.goto('/bookings');
  const rejected = client.getByRole('listitem').filter({ hasText: 'Отклонена специалистом' });
  await expect(rejected.getByText('Причина: Заболела')).toBeVisible();

  const pending = client.getByRole('listitem').filter({ hasText: 'Ждёт подтверждения' });
  await pending.getByRole('button', { name: 'Отменить' }).click();
  await pending.getByRole('button', { name: 'Отменить запись' }).click();
  await expect(client.getByText('Вы отменили')).toBeVisible();
  await waitForLetter(irina.email, 'Запись отменена');

  await clientContext.close();
  await specialistContext.close();
});
