import { E2E } from '../support/env.ts';
import { expect, test, uniqueEmail } from '../support/fixtures.ts';
import { linkTo, waitForLetter } from '../support/mailpit.ts';

test('a new user confirms the email from the letter and signs in', async ({ page }) => {
  const email = uniqueEmail('anna');

  await page.goto('/register');
  await page.getByLabel('Имя').fill('Анна');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Пароль').fill(E2E.password);
  // The time zone comes from the browser (timezoneId in playwright.config.ts)
  await expect(page.getByText('Часовой пояс: Europe/Moscow')).toBeVisible();
  await page.getByRole('button', { name: 'Зарегистрироваться' }).click();

  await expect(page).toHaveURL(/\/login\?registered=1$/);
  await expect(page.getByText('Мы отправили письмо на указанный email')).toBeVisible();

  // The real letter, sent by the outbox worker through SMTP to Mailpit
  const letter = await waitForLetter(email, 'Подтвердите email');
  await page.goto(linkTo(letter, '/verify-email'));
  await expect(page.getByText('Email подтверждён.')).toBeVisible();
  // The token travels in the URL fragment and is removed from the address bar (slice 2)
  expect(new URL(page.url()).hash).toBe('');

  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Пароль').fill(E2E.password);
  await page.getByRole('button', { name: 'Войти' }).click();

  // /start: not a specialist → their bookings; no "confirm your email" banner
  await expect(page).toHaveURL(/\/bookings$/);
  await expect(page.getByRole('heading', { name: 'Мои записи' })).toBeVisible();
  await expect(page.getByText('Подтвердите email: мы отправили письмо')).toHaveCount(0);
});

test('a confirmation link works only once', async ({ page }) => {
  const email = uniqueEmail('boris');
  await page.goto('/register');
  await page.getByLabel('Имя').fill('Борис');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Пароль').fill(E2E.password);
  await page.getByRole('button', { name: 'Зарегистрироваться' }).click();
  await expect(page).toHaveURL(/\/login\?registered=1$/);

  const link = linkTo(await waitForLetter(email, 'Подтвердите email'), '/verify-email');
  await page.goto(link);
  await expect(page.getByText('Email подтверждён.')).toBeVisible();

  // As a person would: the link from the letter opens again in a new tab. A second goto in
  // the same tab only changes the #fragment — the page is not reloaded, nothing is sent
  const again = await page.context().newPage();
  await again.goto(link);
  await expect(again.getByText('Ссылка недействительна или устарела')).toBeVisible();
  await expect(again.getByText('Email подтверждён.')).toHaveCount(0);
});
