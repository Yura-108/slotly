import { Injectable } from '@nestjs/common';
import type { CookieOptions, Request, Response } from 'express';
import { AppConfig } from '../../infrastructure/config/config.schema';
import { SESSION_ABSOLUTE_TIMEOUT_MS } from './domain/session-policy';

/**
 * The cookie is an HTTP detail, so it lives next to the controller, not in the service.
 * `__Host-` + Secure + Path=/ + no Domain: only our exact origin can set or read it (ADR-005).
 */
@Injectable()
export class SessionCookie {
  constructor(private readonly config: AppConfig) {}

  private get options(): CookieOptions {
    return {
      httpOnly: true,
      secure: this.config.session.cookieSecure,
      sameSite: 'lax',
      path: '/',
    };
  }

  read(request: Request): string | undefined {
    const value: unknown = request.cookies?.[this.config.session.cookieName];
    return typeof value === 'string' && value.length > 0 ? value : undefined;
  }

  /**
   * Max-Age equals the absolute session lifetime. The browser keeps the cookie that long;
   * the shorter sliding expiry is enforced by the server, which can also revoke it any time.
   */
  set(response: Response, token: string): void {
    response.cookie(this.config.session.cookieName, token, {
      ...this.options,
      maxAge: SESSION_ABSOLUTE_TIMEOUT_MS,
    });
  }

  clear(response: Response): void {
    response.clearCookie(this.config.session.cookieName, this.options);
  }
}
