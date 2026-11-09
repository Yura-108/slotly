import { Module } from '@nestjs/common';
import { ConfigModule } from './infrastructure/config/config.module';
import { DatabaseModule } from './infrastructure/database/database.module';
import { HealthController } from './infrastructure/health/health.controller';
import { LoggingModule } from './infrastructure/logging/logging.module';

@Module({
  imports: [ConfigModule, LoggingModule, DatabaseModule],
  controllers: [HealthController],
})
export class AppModule {}
