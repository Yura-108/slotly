import { Inject, Injectable, Logger } from '@nestjs/common';
import { DATABASE, type Database } from '../../infrastructure/database/database.module';
import type { AuthContext } from '../../infrastructure/http/auth-context';
import { UsersService } from '../users/users.service';
import { InvalidCredentialsError } from './domain/errors';
import { checkSession, startSession } from './domain/session-policy';
import { PasswordHasher } from './password-hasher';
import { generateSessionToken, hashSessionToken } from './session-token';
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
    private readonly users: UsersService,
    private readonly sessions: SessionsRepository,
    private readonly hasher: PasswordHasher,
  ) {}

  /**
   * Same outcome and timing for a new and a taken email (ADR-005): the password is
   * hashed first in both cases, and a taken email is not reported to the caller.
   */
  async register(input: {
    email: string;
    password: string;
    name: string;
    timezone: string;
  }): Promise<void> {
    const passwordHash = await this.hasher.hash(input.password);
    const result = await this.users.create({
      email: input.email,
      passwordHash,
      name: input.name,
      timezone: input.timezone,
    });
    if (result.status === 'email_taken') {
      // Slice 2 sends "you already have an account" to that address instead
      this.logger.log('Registration attempt for an existing email');
      return;
    }
    this.logger.log({ userId: result.id }, 'User registered');
  }

  async login(input: { email: string; password: string; userAgent?: string }): Promise<NewSession> {
    const credentials = await this.users.findCredentialsByEmail(input.email);
    if (!credentials) {
      await this.hasher.verifyDummy(input.password);
      throw new InvalidCredentialsError();
    }
    if (!(await this.hasher.verify(credentials.passwordHash, input.password))) {
      throw new InvalidCredentialsError();
    }
    if (this.hasher.needsRehash(credentials.passwordHash)) {
      await this.users.updatePasswordHash(credentials.id, await this.hasher.hash(input.password));
    }

    // A new token on every login: a token planted before login is useless (session fixation)
    const token = generateSessionToken();
    const session = await this.sessions.insert(this.db, {
      userId: credentials.id,
      tokenHash: hashSessionToken(token),
      ...startSession(new Date()),
      userAgent: input.userAgent?.slice(0, USER_AGENT_MAX_LENGTH) ?? null,
    });
    this.logger.log({ userId: credentials.id, sessionId: session.id }, 'User logged in');
    return { token };
  }

  /** Idempotent: an unknown or already deleted token is fine. */
  async logout(token: string): Promise<void> {
    await this.sessions.deleteByTokenHash(this.db, hashSessionToken(token));
  }

  /** Resolves a cookie token to the caller, or null when the session is unknown or expired. */
  async authenticate(token: string, now: Date): Promise<AuthContext | null> {
    const session = await this.sessions.findByTokenHash(this.db, hashSessionToken(token));
    if (!session) return null;

    const check = checkSession(session, now);
    if (check.status === 'expired') {
      await this.sessions.deleteById(this.db, session.id);
      return null;
    }
    if (check.refresh) await this.sessions.refresh(this.db, session.id, check.refresh);

    return { userId: session.userId, sessionId: session.id };
  }
}
