import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PasswordHasher } from './password-hasher';
import { SessionCookie } from './session-cookie';
import { SessionGuard } from './session.guard';
import { SessionsRepository } from './sessions.repository';

@Module({
  imports: [UsersModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    PasswordHasher,
    SessionCookie,
    SessionsRepository,
    { provide: APP_GUARD, useClass: SessionGuard },
  ],
})
export class AuthModule {}
