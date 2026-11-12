import { signIn, verifiedPerson } from '../support/api.ts';
import { expect, personContext, test, uniqueSlug } from '../support/fixtures.ts';

test('a specialist sets up the page, a service and the week; clients see free slots', async ({
  page,
  browser,
}) => {
  const irina = await verifiedPerson('Ирина', 'Europe/Berlin');
  await signIn(page.context(), irina);
  const slug = uniqueSlug('irina');

  await page.goto('/specialist/settings');
  await page.getByLabel('Имя на странице').fill('Ирина Смирнова');
  await page.getByLabel('Адрес страницы').fill(slug);
  // The profile time zone is offered from the user's own
  await expect(page.getByLabel('Часовой пояс расписания')).toHaveValue('Europe/Berlin');
  await page.getByRole('button', { name: 'Включить профиль специалиста' }).click();

  await expect(page).toHaveURL(/\/specialist\/services$/);
  await page.getByLabel('Название').fill('Консультация');
  await page.getByLabel('Длительность, минут').fill('60');
  await page.getByRole('button', { name: 'Добавить' }).click();
  await expect(page.getByText('Консультация')).toBeVisible();

  await page.goto('/specialist/schedule');
  // A new interval is 10:00–18:00 by default; add one to every day of the week
  const addInterval = page.getByRole('button', { name: '+ интервал' });
  await expect(addInterval).toHaveCount(7);
  for (const button of await addInterval.all()) await button.click();
  await expect(page.getByLabel('Понедельник: начало')).toHaveValue('10:00');
  await page.getByRole('button', { name: 'Сохранить расписание' }).click();
  await expect(page.getByText('Расписание сохранено.')).toBeVisible();

  // A visitor without an account sees the page with free time
  const visitor = await personContext(browser);
  const publicPage = await visitor.newPage();
  await publicPage.goto(`/book/${slug}`);
  await expect(publicPage.getByRole('heading', { name: 'Ирина Смирнова' })).toBeVisible();
  await expect(publicPage.getByText('Консультация')).toBeVisible();
  await expect(publicPage.locator('button[aria-pressed]').first()).toBeVisible();
  await visitor.close();
});
