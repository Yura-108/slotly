import { Controller, Get, Inject, Logger, ServiceUnavailableException } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { DATABASE, type Database } from '../database/database.module';

@Controller('health')
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

  constructor(@Inject(DATABASE) private readonly db: Database) {}

  @Get()
  async check(): Promise<{ status: 'ok' }> {
    try {
      await this.db.execute(sql`select 1`);
    } catch (error) {
      // The cause goes to the logs; the client only learns that the dependency is down
      this.logger.error({ err: error }, 'Health check: database query failed');
      throw new ServiceUnavailableException('Database is unavailable');
    }
    return { status: 'ok' };
  }
}
