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
  }
}
