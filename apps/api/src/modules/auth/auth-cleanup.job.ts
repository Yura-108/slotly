import { Inject, Injectable, Logger } from '@nestjs/common';
import { AppConfig } from '../../infrastructure/config/config.schema';
import { DATABASE, type Database } from '../../infrastructure/database/database.module';
import { inBatches, PeriodicJob } from '../../infrastructure/jobs/periodic-job';
import { AuthTokensRepository } from './auth-tokens.repository';
import { SessionsRepository } from './sessions.repository';

/**
 * Deletes sessions and one-time tokens past their expiry (ADR-005). They are already
 * rejected by expiry checks; deleting them keeps the tables and their indexes small.
 */
@Injectable()
export class AuthCleanupJob extends PeriodicJob {
  private readonly log = new Logger(AuthCleanupJob.name);
  protected readonly intervalMs: number;

  constructor(
    config: AppConfig,
    @Inject(DATABASE) private readonly db: Database,
    private readonly sessions: SessionsRepository,
    private readonly tokens: AuthTokensRepository,
  ) {
    super();
    this.intervalMs = config.jobs.cleanupIntervalMs;
  }

  async run(now: Date): Promise<void> {
    const sessions = await inBatches((limit) => this.sessions.deleteExpired(this.db, now, limit));
    const tokens = await inBatches((limit) => this.tokens.deleteExpired(this.db, now, limit));
    if (sessions + tokens > 0) {
      this.log.log({ sessions, tokens }, 'Deleted expired sessions and tokens');
    }
  }
}
