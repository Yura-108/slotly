import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { type AuthenticatedRequest, IS_PUBLIC } from '../../infrastructure/http/auth-context';
import { AuthService } from './auth.service';
import { NotAuthenticatedError } from './domain/errors';
import { SessionCookie } from './session-cookie';

/**
 * Global guard: every route requires a valid session unless marked @Public().
 * It only establishes *who* calls; *what* they may do is checked in services (ADR-005).
 */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: AuthService,
    private readonly cookie: SessionCookie,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = this.cookie.read(request);
    const auth = token ? await this.auth.authenticate(token, new Date()) : null;
    if (!auth) throw new NotAuthenticatedError();

    request.auth = auth;
    return true;
  }
}
