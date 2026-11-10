import { createParamDecorator, type ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Request } from 'express';

/**
 * Routes are private by default: the global session guard (auth module) rejects
 * requests without a valid session unless the handler is marked `@Public()`.
 * Forgetting a decorator therefore fails closed, not open.
 */
export const IS_PUBLIC = 'slotly:isPublic';
export const Public = () => SetMetadata(IS_PUBLIC, true);

/** Who is calling; set by the session guard. Defined here so any module can read it without depending on auth. */
export interface AuthContext {
  readonly userId: string;
  readonly sessionId: string;
}

export type AuthenticatedRequest = Request & { auth?: AuthContext };

export const CurrentAuth = createParamDecorator((_data: unknown, context: ExecutionContext) => {
  const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
  if (!request.auth) {
    // Only reachable if @CurrentAuth() is used on a @Public() route — a programming error
    throw new Error('@CurrentAuth() used on a route without an authenticated session');
  }
  return request.auth;
});
