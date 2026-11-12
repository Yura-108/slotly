import { describe, expect, it } from 'vitest';
import type { OutboxMessage } from './messages';
import { renderEmail } from './templates';

/**
 * The exact text of every email. Copy is product content: a change must show up as a
 * reviewed diff here, not slip through (mutation testing found prose mutants nothing
 * noticed). Regenerate deliberately with `vitest -u`.
 */
const time = {
  serviceName: 'Консультация',
  startAt: '2026-11-19T11:00:00.000Z',
  endAt: '2026-11-19T12:00:00.000Z',
  timeZone: 'Europe/Moscow',
  bookingsUrl: 'https://slotly.example/bookings',
};
const to = { to: 'anna@example.test', name: 'Анна' };

const text = (message: OutboxMessage) => {
  const { subject, text: body } = renderEmail(message);
  return `${subject}\n---\n${body}`;
};

describe('email copy', () => {
  it('verify email (full: subject, text and HTML)', () => {
    expect(
      renderEmail({
        type: 'auth.verify_email',
        payload: { ...to, link: 'https://slotly.example/verify-email#token=t' },
      }),
    ).toMatchInlineSnapshot(`
      {
        "html": "<p>Здравствуйте, Анна!</p>
      <p><a href="https://slotly.example/verify-email#token=t">Подтвердить email</a></p>
      <p>Ссылка действует 24 часа. Если вы не регистрировались в Slotly, просто проигнорируйте это письмо.</p>",
        "subject": "Подтвердите email в Slotly",
        "text": "Здравствуйте, Анна!

      Подтвердить email: https://slotly.example/verify-email#token=t

      Ссылка действует 24 часа. Если вы не регистрировались в Slotly, просто проигнорируйте это письмо.",
      }
    `);
  });

  it('password reset', () => {
    expect(
      text({
        type: 'auth.password_reset',
        payload: { ...to, link: 'https://slotly.example/reset-password#token=t' },
      }),
    ).toMatchInlineSnapshot(`
      "Сброс пароля в Slotly
      ---
      Здравствуйте, Анна!

      Задать новый пароль: https://slotly.example/reset-password#token=t

      Ссылка действует 1 час. После смены пароля все ваши сеансы будут завершены. Если вы не запрашивали сброс, проигнорируйте письмо — пароль останется прежним."
    `);
  });

  it('account exists', () => {
    expect(
      text({
        type: 'auth.account_exists',
        payload: {
          ...to,
          loginUrl: 'https://slotly.example/login',
          resetUrl: 'https://slotly.example/forgot-password',
        },
      }),
    ).toMatchInlineSnapshot(`
      "Вход в Slotly
      ---
      Здравствуйте, Анна!

      Кто-то попытался зарегистрироваться в Slotly с этим адресом, но аккаунт уже существует.

      Войти: https://slotly.example/login

      Забыли пароль? Восстановить: https://slotly.example/forgot-password

      Если это были не вы, ничего делать не нужно."
    `);
  });

  it('new booking for the specialist, with and without confirmation', () => {
    const base = { ...time, ...to, clientName: 'Борис' };
    expect(
      text({ type: 'booking.new_for_specialist', payload: { ...base, needsConfirmation: true } }),
    ).toMatchInlineSnapshot(`
      "Новая заявка: Консультация
      ---
      Здравствуйте, Анна!

      Открыть записи: https://slotly.example/bookings

      Борис записывается на услугу «Консультация»: четверг, 19 ноября 2026 г., 14:00–15:00 (Europe/Moscow).

      Заявка ждёт вашего подтверждения. Без ответа она истечёт через 24 часа или к началу записи."
    `);
    expect(
      text({ type: 'booking.new_for_specialist', payload: { ...base, needsConfirmation: false } }),
    ).toMatchInlineSnapshot(`
      "Новая запись: Консультация
      ---
      Здравствуйте, Анна!

      Открыть записи: https://slotly.example/bookings

      Борис записывается на услугу «Консультация»: четверг, 19 ноября 2026 г., 14:00–15:00 (Europe/Moscow).

      Запись подтверждена автоматически."
    `);
  });

  it('booking for the client: a request and a confirmed booking', () => {
    const base = { ...time, ...to, specialistName: 'Ирина' };
    expect(text({ type: 'booking.created_for_client', payload: { ...base, status: 'pending' } }))
      .toMatchInlineSnapshot(`
      "Заявка отправлена: Консультация
      ---
      Здравствуйте, Анна!

      Мои записи: https://slotly.example/bookings

      Ирина, «Консультация»: четверг, 19 ноября 2026 г., 14:00–15:00 (Europe/Moscow).

      Специалист ответит на заявку в течение 24 часов — мы сообщим о решении письмом."
    `);
    expect(text({ type: 'booking.created_for_client', payload: { ...base, status: 'confirmed' } }))
      .toMatchInlineSnapshot(`
      "Вы записаны: Консультация
      ---
      Здравствуйте, Анна!

      Мои записи: https://slotly.example/bookings

      Ирина, «Консультация»: четверг, 19 ноября 2026 г., 14:00–15:00 (Europe/Moscow).

      Запись подтверждена."
    `);
  });

  it('status changes without a reason', () => {
    const base = { ...time, ...to };
    expect(text({ type: 'booking.confirmed', payload: { ...base, specialistName: 'Ирина' } }))
      .toMatchInlineSnapshot(`
      "Запись подтверждена: Консультация
      ---
      Здравствуйте, Анна!

      Мои записи: https://slotly.example/bookings

      Ирина подтверждает запись на услугу «Консультация»: четверг, 19 ноября 2026 г., 14:00–15:00 (Europe/Moscow)."
    `);
    expect(text({ type: 'booking.rejected', payload: { ...base, specialistName: 'Ирина' } }))
      .toMatchInlineSnapshot(`
      "Заявка отклонена: Консультация
      ---
      Здравствуйте, Анна!

      Мои записи: https://slotly.example/bookings

      Ирина не может принять заявку на услугу «Консультация»: четверг, 19 ноября 2026 г., 14:00–15:00 (Europe/Moscow).

      Вы можете выбрать другое время на странице специалиста."
    `);
    expect(
      text({
        type: 'booking.cancelled',
        payload: { ...base, cancelledBy: 'client', byName: 'Борис' },
      }),
    ).toMatchInlineSnapshot(`
      "Запись отменена: Консультация
      ---
      Здравствуйте, Анна!

      Мои записи: https://slotly.example/bookings

      Борис отменяет запись на услугу «Консультация»: четверг, 19 ноября 2026 г., 14:00–15:00 (Europe/Moscow).

      Это время снова свободно для записи."
    `);
    expect(
      text({
        type: 'booking.expired',
        payload: {
          ...base,
          specialistName: 'Ирина',
          specialistUrl: 'https://slotly.example/book/irina',
        },
      }),
    ).toMatchInlineSnapshot(`
      "Заявка истекла: Консультация
      ---
      Здравствуйте, Анна!

      Выбрать время: https://slotly.example/book/irina

      Заявка к специалисту Ирина на услугу «Консультация» на четверг, 19 ноября 2026 г., 14:00–15:00 (Europe/Moscow) осталась без ответа и больше не действует.

      Выберите другое время — специалист, возможно, был недоступен."
    `);
  });
});

describe('HTML escaping', () => {
  it('escapes every character that can break out of text or an attribute', () => {
    const email = renderEmail({
      type: 'auth.verify_email',
      payload: {
        to: 'x@example.test',
        name: `<b>"Tom" & 'Jerry'</b>`,
        link: `https://slotly.example/verify-email#token="><script>`,
      },
    });
    expect(email.html).toContain('&lt;b&gt;&quot;Tom&quot; &amp; &#39;Jerry&#39;&lt;/b&gt;');
    expect(email.html).toContain(
      'href="https://slotly.example/verify-email#token=&quot;&gt;&lt;script&gt;"',
    );
    expect(email.html).not.toMatch(/<script|<b>/);
  });
});
