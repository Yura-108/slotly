import type { BrowserContext } from '@playwright/test';
import { E2E } from './env.ts';
import { clientIp, uniqueEmail, uniqueSlug } from './fixtures.ts';
import { linkTo, waitForLetter } from './mailpit.ts';

/**
 * Test data through the public HTTP API, as a browser would send it (Origin, own client
 * address, session cookie). Setup takes milliseconds this way; only the scenario under
 * test goes through the UI (testing.md).
 */
export class ApiClient {
  private cookie = '';

  /** The session token from the last sign-in (value of the __Host-session cookie). */
  get session(): string {
    return this.cookie.replace('__Host-session=', '');
  }
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

/**
 * Signs a person in a browser context without the login form (that form has its own
 * test): the session from the API goes into the context as the same cookie the server
 * sets. Cookies are bound to the host, not the port, so it is valid for the web app.
 */
export async function signIn(context: BrowserContext, person: Person): Promise<void> {
  await context.addCookies([
    {
      name: '__Host-session',
      value: person.api.session,
      // __Host- cookies must be Secure, and DevTools sets a Secure cookie only for an https
      // URL. The cookie is host-only (localhost, any port); Chromium sends it to
      // http://localhost too, as localhost is a secure context — as with a real sign-in
      url: 'https://localhost',
      httpOnly: true,
      secure: true,
      sameSite: 'Lax',
    },
  ]);
}

export interface Specialist extends Person {
  slug: string;
  serviceId: string;
}

/**
 * A specialist in Berlin working 09:00–17:00 every day with a 60-minute service — set up
 * through the API in milliseconds. Setting it up through the UI is a test of its own.
 */
export async function specialist(
  options: { confirmationMode?: 'auto' | 'manual'; name?: string } = {},
): Promise<Specialist> {
  const person = await verifiedPerson(options.name ?? 'Ирина', 'Europe/Berlin');
  const slug = uniqueSlug('irina');
  await person.api.call('POST', '/me/specialist-profile', {
    slug,
    displayName: 'Ирина Смирнова',
    timezone: 'Europe/Berlin',
    confirmationMode: options.confirmationMode ?? 'manual',
  });
  await person.api.call('PUT', '/me/availability', {
    intervals: [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({
      weekday,
      start: '09:00',
      end: '17:00',
    })),
  });
  const service = await person.api.call<{ id: string }>('POST', '/me/services', {
    name: 'Консультация',
    durationMinutes: 60,
  });
  return { ...person, slug, serviceId: service.id };
}

export interface Slot {
  start: string;
  end: string;
}

/** Free slots of the specialist's service over the next `days` days, as the API sees them. */
export async function freeSlots(owner: Specialist, days = 14): Promise<Slot[]> {
  const from = new Date();
  const query = new URLSearchParams({
    serviceId: owner.serviceId,
    from: from.toISOString(),
    to: new Date(from.getTime() + days * 24 * 60 * 60 * 1000).toISOString(),
  });
  const { items } = await new ApiClient().call<{ items: Slot[] }>(
    'GET',
    `/specialists/${owner.slug}/slots?${query.toString()}`,
  );
  return items;
}
