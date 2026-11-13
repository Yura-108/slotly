import { GenericContainer, type StartedTestContainer, Wait } from 'testcontainers';
import { composeImage } from './compose-image';

const SMTP_PORT = 1025;
const API_PORT = 8025;

export interface ReceivedEmail {
  id: string;
  subject: string;
  text: string;
  messageId: string;
}

interface MailpitSummary {
  ID: string;
  MessageID: string;
  Subject: string;
  To: { Address: string }[];
}

export interface TestMailbox {
  smtpUrl: string;
  /** Emails delivered to `address`, oldest first. */
  inbox: (address: string) => Promise<ReceivedEmail[]>;
  stop: () => Promise<void>;
}

/**
 * The same Mailpit as compose.yaml, so e2e tests send real SMTP and read what arrived
 * through Mailpit's HTTP API — no fake of our mail code.
 */
export async function startMailpit(): Promise<TestMailbox> {
  const container: StartedTestContainer = await new GenericContainer(composeImage('mailpit'))
    .withExposedPorts(SMTP_PORT, API_PORT)
    // Mailpit resolves the client IP before the SMTP greeting; inside Docker Desktop that
    // lookup can stall for seconds and nodemailer gives up waiting for the greeting
    .withEnvironment({ MP_SMTP_DISABLE_RDNS: 'true' })
    .withWaitStrategy(Wait.forHttp('/livez', API_PORT))
    .start();
  const host = container.getHost();
  const api = `http://${host}:${container.getMappedPort(API_PORT)}/api/v1`;

  const getJson = async <T>(path: string): Promise<T> => {
    const response = await fetch(`${api}${path}`);
    if (!response.ok) throw new Error(`Mailpit ${path}: ${response.status}`);
    return (await response.json()) as T;
  };

  return {
    smtpUrl: `smtp://${host}:${container.getMappedPort(SMTP_PORT)}`,
    inbox: async (address) => {
      const { messages } = await getJson<{ messages: MailpitSummary[] }>('/messages?limit=500');
      const mine = messages
        .filter((m) => m.To.some((to) => to.Address.toLowerCase() === address.toLowerCase()))
        .reverse();
      return Promise.all(
        mine.map(async (m) => {
          const full = await getJson<{ Text: string }>(`/message/${m.ID}`);
          return { id: m.ID, subject: m.Subject, text: full.Text, messageId: m.MessageID };
        }),
      );
    },
    stop: async () => {
      await container.stop();
    },
  };
}
