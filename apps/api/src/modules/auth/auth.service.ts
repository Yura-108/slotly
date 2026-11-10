import { Inject, Injectable, Logger } from '@nestjs/common';
import { AppConfig } from '../../infrastructure/config/config.schema';
import { DATABASE, type Database, type Tx } from '../../infrastructure/database/database.module';
import type { AuthContext } from '../../infrastructure/http/auth-context';
import { NotificationsService } from '../notifications/notifications.service';
import { UsersService } from '../users/users.service';
import { AuthTokensRepository } from './auth-tokens.repository';
import {
  type AuthTokenPurpose,
  authTokenExpiresAt,
  authTokenLink,
} from './domain/auth-token-policy';
import { InvalidCredentialsError, TokenInvalidOrExpiredError } from './domain/errors';
import { checkSession, startSession } from './domain/session-policy';
import { PasswordHasher } from './password-hasher';
import { generateSecretToken, hashSecretToken } from './secret-token';
import { SessionsRepository } from './sessions.repository';

export interface NewSession {
  /** Goes into the cookie and nowhere else: neither the database nor logs see it. */
  token: string;
}

const USER_AGENT_MAX_LENGTH = 512;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly config: AppConfig,
    private readonly users: UsersService,
    private readonly notifications: NotificationsService,
    private readonly sessions: SessionsRepository,
    private readonly tokens: AuthTokensRepository,
    private readonly hasher: PasswordHasher,
  ) {}

  /**
   * Same response and timing for a new and a taken email (ADR-005): the password is
   * hashed first in both cases. The owner of the address learns the outcome by email.
   * User, token and email intent are saved atomically (ADR-012).
   */
  async register(input: {
    email: string;
    password: string;
    name: string;
    timezone: string;
  }): Promise<void> {
    const passwordHash = await this.hasher.hash(input.password);
    await this.db.transaction(async (tx) => {
      const result = await this.users.create(
        { email: input.email, passwordHash, name: input.name, timezone: input.timezone },
        tx,
      );
      if (result.status === 'created') {
        await this.issueVerificationEmail(tx, result.user);
        this.logger.log({ userId: result.user.id }, 'User registered');
        return;
      }
      const existing = await this.users.findAccountByEmail(input.email, tx);
      if (!existing) return; // deleted between the two statements: nothing to tell
      await this.notifications.enqueue(tx, {
        type: 'auth.account_exists',
        payload: {
          to: existing.email,
          name: existing.name,
          loginUrl: `${this.config.appOrigin}/login`,
          resetUrl: `${this.config.appOrigin}/forgot-password`,
        },
      });
      this.logger.log('Registration attempt for an existing email');
    });
  }

  async login(input: { email: string; password: string; userAgent?: string }): Promise<NewSession> {
    const account = await this.users.findAccountByEmail(input.email);
    if (!account) {
      await this.hasher.verifyDummy(input.password);
      throw new InvalidCredentialsError();
    }
    if (!(await this.hasher.verify(account.passwordHash, input.password))) {
      throw new InvalidCredentialsError();
    }
    if (this.hasher.needsRehash(account.passwordHash)) {
      await this.users.updatePasswordHash(account.id, await this.hasher.hash(input.password));
    }

    // A new token on every login: a token planted before login is useless (session fixation)
    const token = generateSecretToken();
    const session = await this.sessions.insert(this.db, {
      userId: account.id,
      tokenHash: hashSecretToken(token),
      ...startSession(new Date()),
      userAgent: input.userAgent?.slice(0, USER_AGENT_MAX_LENGTH) ?? null,
    });
    this.logger.log({ userId: account.id, sessionId: session.id }, 'User logged in');
    return { token };
  }

  /** Idempotent: an unknown or already deleted token is fine. */
  async logout(token: string): Promise<void> {
    await this.sessions.deleteByTokenHash(this.db, hashSecretToken(token));
  }

  /** Resolves a cookie token to the caller, or null when the session is unknown or expired. */
  async authenticate(token: string, now: Date): Promise<AuthContext | null> {
    const session = await this.sessions.findByTokenHash(this.db, hashSecretToken(token));
    if (!session) return null;

    const check = checkSession(session, now);
    if (check.status === 'expired') {
      await this.sessions.deleteById(this.db, session.id);
      return null;
    }
    if (check.refresh) await this.sessions.refresh(this.db, session.id, check.refresh);

    return { userId: session.userId, sessionId: session.id };
  }

  async verifyEmail(token: string): Promise<void> {
    const now = new Date();
    await this.db.transaction(async (tx) => {
      const owner = await this.tokens.consume(tx, {
        tokenHash: hashSecretToken(token),
        purpose: 'verify_email',
        now,
      });
      if (!owner) throw new TokenInvalidOrExpiredError();
      await this.users.markEmailVerified(owner.userId, now, tx);
      this.logger.log({ userId: owner.userId }, 'Email verified');
    });
  }

  /** For a signed-in user whose link expired or got lost. No-op if already verified. */
  async resendVerification(userId: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      const user = await this.users.getProfile(userId, tx);
      if (user.emailVerified) return;
      await this.issueVerificationEmail(tx, user);
    });
  }

  /** Same response for any email (ADR-005); the residual timing difference is accepted in ADR-012. */
  async requestPasswordReset(email: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      const account = await this.users.findAccountByEmail(email, tx);
      if (!account) return;
      const token = await this.issueToken(tx, account.id, 'reset_password');
      await this.notifications.enqueue(tx, {
        type: 'auth.password_reset',
        payload: {
          to: account.email,
          name: account.name,
          link: authTokenLink(this.config.appOrigin, 'reset_password', token),
        },
      });
      this.logger.log({ userId: account.id }, 'Password reset requested');
    });
  }

  /**
   * New password, one-time token and the end of every session — all or nothing (ADR-005).
   * Someone who stole a session loses it; the link also proves ownership of the email.
   */
  async resetPassword(token: string, newPassword: string): Promise<void> {
    const passwordHash = await this.hasher.hash(newPassword);
    const now = new Date();
    await this.db.transaction(async (tx) => {
      const owner = await this.tokens.consume(tx, {
        tokenHash: hashSecretToken(token),
        purpose: 'reset_password',
        now,
      });
      if (!owner) throw new TokenInvalidOrExpiredError();
      await this.users.updatePasswordHash(owner.userId, passwordHash, tx);
      await this.users.markEmailVerified(owner.userId, now, tx);
      await this.sessions.deleteAllForUser(tx, owner.userId);
      this.logger.log({ userId: owner.userId }, 'Password reset; all sessions revoked');
    });
  }

  private async issueVerificationEmail(
    tx: Tx,
    user: { id: string; email: string; name: string },
  ): Promise<void> {
    const token = await this.issueToken(tx, user.id, 'verify_email');
    await this.notifications.enqueue(tx, {
      type: 'auth.verify_email',
      payload: {
        to: user.email,
        name: user.name,
        link: authTokenLink(this.config.appOrigin, 'verify_email', token),
      },
    });
  }

  /** Returns the raw token for the email link; only its hash is stored. */
  private async issueToken(tx: Tx, userId: string, purpose: AuthTokenPurpose): Promise<string> {
    const now = new Date();
    await this.tokens.revokeUnused(tx, { userId, purpose, now });
    const token = generateSecretToken();
    await this.tokens.insert(tx, {
      userId,
      purpose,
      tokenHash: hashSecretToken(token),
      expiresAt: authTokenExpiresAt(purpose, now),
    });
    return token;
  }
}
