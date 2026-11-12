import { verifiedPerson } from '../support/api.ts';
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

test('a forgotten password is replaced through the emailed link', async ({ page }) => {
  const anna = await verifiedPerson('Анна');
  const newPassword = 'e2e brand new password';

  await page.goto('/login');
  await page.getByRole('link', { name: 'Забыли пароль?' }).click();
  // The login page has an "Email" field too: wait for the new page, or the old field is
  // filled while the client-side navigation is still running
  await expect(page.getByRole('heading', { name: 'Восстановление пароля' })).toBeVisible();
  await page.getByLabel('Email').fill(anna.email);
  await page.getByRole('button', { name: 'Отправить ссылку' }).click();
  await expect(page.getByRole('status')).toBeVisible();

  const letter = await waitForLetter(anna.email, 'Сброс пароля');
  await page.goto(linkTo(letter, '/reset-password'));
  await page.getByLabel('Новый пароль').fill(newPassword);
  await page.getByLabel('Повторите пароль').fill(newPassword);
  await page.getByRole('button', { name: 'Сменить пароль' }).click();
  await expect(page.getByText('Пароль изменён. Войдите с новым паролем.')).toBeVisible();

  const signInWith = async (password: string) => {
    await page.getByLabel('Email').fill(anna.email);
    await page.getByLabel('Пароль').fill(password);
    await page.getByRole('button', { name: 'Войти' }).click();
  };
  await signInWith(E2E.password);
  await expect(page.getByText('Неверный email или пароль.')).toBeVisible();
  await signInWith(newPassword);
  await expect(page).toHaveURL(/\/bookings$/);
});
