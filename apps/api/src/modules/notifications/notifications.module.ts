import { Module } from '@nestjs/common';
import { MailSender } from './mail-sender';
import { NotificationsService } from './notifications.service';
import { OutboxCleanupJob } from './outbox-cleanup.job';
import { OutboxProcessor } from './outbox.processor';
import { OutboxRepository } from './outbox.repository';
import { OutboxWorker } from './outbox.worker';

/** Depends on no other module (ADR-006): every email is fully described by its payload. */
@Module({
  providers: [
    NotificationsService,
    OutboxRepository,
    OutboxProcessor,
    OutboxWorker,
    OutboxCleanupJob,
    MailSender,
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
