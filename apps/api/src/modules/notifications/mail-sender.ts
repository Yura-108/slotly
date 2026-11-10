import { Injectable, type OnApplicationShutdown } from '@nestjs/common';
import { createTransport } from 'nodemailer';
import { AppConfig } from '../../infrastructure/config/config.schema';

export interface OutgoingEmail {
  to: string;
  subject: string;
  text: string;
  html: string;
  /** Stable per outbox message, so a rare duplicate delivery is recognizable (ADR-012). */
  messageId: string;
}

/** The SMTP boundary (ADR-012): Mailpit locally, the provider's SMTP in production. */
@Injectable()
export class MailSender implements OnApplicationShutdown {
  private readonly transport;
  private readonly from: string;

  constructor(config: AppConfig) {
    this.from = config.email.from;
    this.transport = createTransport({
      url: config.email.smtpUrl,
      // nodemailer's defaults wait minutes; a stuck send would hold the lease and the batch
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 30_000,
    });
  }

  async send(email: OutgoingEmail): Promise<void> {
    await this.transport.sendMail({ from: this.from, ...email });
  }

  onApplicationShutdown(): void {
    this.transport.close();
  }
}
