import { E2E } from './env.ts';
import { clientIp, uniqueEmail } from './fixtures.ts';
import { linkTo, waitForLetter } from './mailpit.ts';

/**
 * Test data through the public HTTP API, as a browser would send it (Origin, own client
 * address, session cookie). Setup takes milliseconds this way; only the scenario under
 * test goes through the UI (testing.md).
 */
export class ApiClient {
  private cookie = '';
  private readonly ip = clientIp();

  async call<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
    const response = await fetch(`${E2E.apiUrl}${path}`, {
      method,
      headers: {
        'content-type': 'application/json',
        origin: E2E.webUrl,
        'x-forwarded-for': this.ip,
        ...(this.cookie ? { cookie: this.cookie } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const session = response.headers.getSetCookie().find((c) => c.startsWith('__Host-session='));
    if (session) this.cookie = session.split(';')[0] ?? '';
    const text = await response.text();
    if (!response.ok) throw new Error(`${method} ${path} → ${response.status} ${text}`);
    return (text ? JSON.parse(text) : undefined) as T;
  }
}

export interface Person {
  email: string;
  name: string;
  api: ApiClient;
}

/**
 * Registers, confirms the email with the link from the real letter, and signs in — the
 * same path a person takes, only without the browser.
 */
export async function verifiedPerson(name: string, timezone = 'Europe/Moscow'): Promise<Person> {
  const email = uniqueEmail(name.toLowerCase().replace(/[^a-z]/g, '') || 'user');
  const api = new ApiClient();
  await api.call('POST', '/auth/register', { email, password: E2E.password, name, timezone });
  const letter = await waitForLetter(email, 'Подтвердите email');
  const token = new URL(linkTo(letter, '/verify-email')).hash.replace('#token=', '');
  await api.call('POST', '/auth/verify-email', { token });
  await api.call('POST', '/auth/login', { email, password: E2E.password });
  return { email, name, api };
}
