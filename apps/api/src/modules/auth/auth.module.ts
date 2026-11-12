import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { NotificationsModule } from '../notifications/notifications.module';
import { UsersModule } from '../users/users.module';
import { AuthCleanupJob } from './auth-cleanup.job';
import { AuthTokensRepository } from './auth-tokens.repository';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PasswordHasher } from './password-hasher';
import { SessionCookie } from './session-cookie';
import { SessionGuard } from './session.guard';
import { SessionsRepository } from './sessions.repository';

@Module({
  imports: [UsersModule, NotificationsModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    PasswordHasher,
    SessionCookie,
    SessionsRepository,
    AuthTokensRepository,
    AuthCleanupJob,
    { provide: APP_GUARD, useClass: SessionGuard },
  ],
})
export class AuthModule {}
