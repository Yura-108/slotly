import { expect } from '@playwright/test';
import { E2E } from './env.ts';

interface MailpitSummary {
  ID: string;
  Subject: string;
}

export interface Letter {
  subject: string;
  text: string;
}

/**
 * Waits for an email to `to` whose subject contains `subject` (Mailpit API). Every test
 * uses its own addresses, so other tests' letters never match. The outbox worker sends
 * asynchronously, hence the polling.
 */
export async function waitForLetter(to: string, subject: string): Promise<Letter> {
  let found: MailpitSummary | undefined;
  await expect
    .poll(
      async () => {
        const query = new URLSearchParams({ query: `to:"${to}"` });
        const response = await fetch(`${E2E.mailpitUrl}/api/v1/search?${query.toString()}`);
        const { messages } = (await response.json()) as { messages: MailpitSummary[] };
        found = messages.find((m) => m.Subject.includes(subject));
        return found !== undefined;
      },
      { message: `email "${subject}" to ${to}`, timeout: 15_000, intervals: [250] },
    )
    .toBe(true);
  const response = await fetch(`${E2E.mailpitUrl}/api/v1/message/${found!.ID}`);
  const message = (await response.json()) as { Subject: string; Text: string };
  return { subject: message.Subject, text: message.Text };
}

/** The first link in the letter that leads to `path` of the web app. */
export function linkTo(letter: Letter, path: string): string {
  const link = letter.text.match(/https?:\/\/\S+/g)?.find((url) => new URL(url).pathname === path);
  if (!link) throw new Error(`No link to ${path} in "${letter.subject}"`);
  return link;
}
