import { Module } from '@nestjs/common';
import { ConfigModule } from './infrastructure/config/config.module';
import { DatabaseModule } from './infrastructure/database/database.module';
import { HealthController } from './infrastructure/health/health.controller';
import { HttpModule } from './infrastructure/http/http.module';
import { LoggingModule } from './infrastructure/logging/logging.module';
import { AuthModule } from './modules/auth/auth.module';
import { ServicesModule } from './modules/services/services.module';
import { SchedulingModule } from './modules/scheduling/scheduling.module';
import { SpecialistsModule } from './modules/specialists/specialists.module';
import { UsersModule } from './modules/users/users.module';

@Module({
  // HttpModule first: its global guards (Origin, rate limit) run before the session guard
  imports: [
    ConfigModule,
    LoggingModule,
    DatabaseModule,
    HttpModule,
    UsersModule,
    AuthModule,
    SpecialistsModule,
    ServicesModule,
    SchedulingModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
