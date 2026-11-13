import { Controller, Get, Inject } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { DATABASE, type Database } from '../database/database.module';
import { Public } from '../http/auth-context';

/**
 * Probes for the orchestrator and the load balancer (ADR-016). They ask different questions:
 * a failed liveness probe restarts the instance, a failed readiness probe only stops traffic.
 */
@Public()
@Controller('health')
export class HealthController {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  /**
   * The process answers HTTP. Deliberately does not touch the database: a restart does not
   * bring the database back, and failing here would restart every instance in a loop.
   */
  @Get('live')
  live(): { status: 'ok' } {
    return { status: 'ok' };
  }

  /**
   * The instance can serve requests: the database answers. While it does not, the global
   * filter turns the error into 503 (pg-errors.ts) within the pool's connect timeout.
   */
  @Get('ready')
  async ready(): Promise<{ status: 'ok' }> {
    await this.db.execute(sql`select 1`);
    return { status: 'ok' };
  }
}
