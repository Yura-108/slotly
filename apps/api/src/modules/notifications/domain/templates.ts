import type { OutboxMessage } from './messages';

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

const escapeHtml = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

const greeting = (name?: string) => (name ? `Здравствуйте, ${name}!` : 'Здравствуйте!');

/** "четверг, 19 ноября 2026 г., 12:00–13:00 (Europe/Berlin)" on the recipient's clock. */
export function formatBookingTime(startAt: string, endAt: string, timeZone: string): string {
  const date = new Intl.DateTimeFormat('ru-RU', {
    timeZone,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const time = new Intl.DateTimeFormat('ru-RU', { timeZone, hour: '2-digit', minute: '2-digit' });
  const start = new Date(startAt);
  return `${date.format(start)}, ${time.format(start)}–${time.format(new Date(endAt))} (${timeZone})`;
}

/** Plain text is the source; HTML is the same paragraphs with escaped user data (e.g. the name). */
function email(subject: string, paragraphs: string[], action?: { label: string; url: string }) {
  const textParts = [...paragraphs];
  if (action) textParts.splice(1, 0, `${action.label}: ${action.url}`);
  const htmlParts = paragraphs.map((p) => `<p>${escapeHtml(p)}</p>`);
  if (action) {
    htmlParts.splice(
      1,
      0,
      `<p><a href="${escapeHtml(action.url)}">${escapeHtml(action.label)}</a></p>`,
    );
  }
  return { subject, text: textParts.join('\n\n'), html: htmlParts.join('\n') };
}

/** Pure: the same message always renders the same email, so templates are unit-tested. */
export function renderEmail(message: OutboxMessage): RenderedEmail {
  switch (message.type) {
    case 'auth.verify_email':
      return email(
        'Подтвердите email в Slotly',
        [
          greeting(message.payload.name),
          'Ссылка действует 24 часа. Если вы не регистрировались в Slotly, просто проигнорируйте это письмо.',
        ],
        { label: 'Подтвердить email', url: message.payload.link },
      );
    case 'auth.password_reset':
      return email(
        'Сброс пароля в Slotly',
        [
          greeting(message.payload.name),
          'Ссылка действует 1 час. После смены пароля все ваши сеансы будут завершены. Если вы не запрашивали сброс, проигнорируйте письмо — пароль останется прежним.',
        ],
        { label: 'Задать новый пароль', url: message.payload.link },
      );
    case 'auth.account_exists':
      return email('Вход в Slotly', [
        greeting(message.payload.name),
        'Кто-то попытался зарегистрироваться в Slotly с этим адресом, но аккаунт уже существует.',
        `Войти: ${message.payload.loginUrl}`,
        `Забыли пароль? Восстановить: ${message.payload.resetUrl}`,
        'Если это были не вы, ничего делать не нужно.',
      ]);
    case 'booking.new_for_specialist': {
      const p = message.payload;
      const when = formatBookingTime(p.startAt, p.endAt, p.timeZone);
      return email(
        p.needsConfirmation ? `Новая заявка: ${p.serviceName}` : `Новая запись: ${p.serviceName}`,
        [
          greeting(p.name),
          `${p.clientName} записывается на услугу «${p.serviceName}»: ${when}.`,
          p.needsConfirmation
            ? 'Заявка ждёт вашего подтверждения. Без ответа она истечёт через 24 часа или к началу записи.'
            : 'Запись подтверждена автоматически.',
        ],
        { label: 'Открыть записи', url: p.bookingsUrl },
      );
    }
    case 'booking.created_for_client': {
      const p = message.payload;
      const when = formatBookingTime(p.startAt, p.endAt, p.timeZone);
      const pending = p.status === 'pending';
      return email(
        pending ? `Заявка отправлена: ${p.serviceName}` : `Вы записаны: ${p.serviceName}`,
        [
          greeting(p.name),
          `${p.specialistName}, «${p.serviceName}»: ${when}.`,
          pending
            ? 'Специалист ответит на заявку в течение 24 часов — мы сообщим о решении письмом.'
            : 'Запись подтверждена.',
        ],
        { label: 'Мои записи', url: p.bookingsUrl },
      );
    }
  }
}
