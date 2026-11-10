import { Inject, Injectable } from '@nestjs/common';
import {
  DATABASE,
  type Database,
  type Executor,
} from '../../infrastructure/database/database.module';
import { normalizeEmail } from './domain/email';
import { UserNotFoundError } from './domain/errors';
import { UsersRepository } from './users.repository';
import type { UserRow } from './users.schema';

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  timezone: string;
  emailVerified: boolean;
}

/** What auth needs: the profile plus the password hash. Never leaves the API. */
export interface UserAccount extends UserProfile {
  passwordHash: string;
}

export type CreateUserResult = { status: 'created'; user: UserProfile } | { status: 'email_taken' };

const toProfile = (user: UserRow): UserProfile => ({
  id: user.id,
  email: user.email,
  name: user.name,
  timezone: user.timezone,
  emailVerified: user.emailVerifiedAt !== null,
});

/**
 * Public API of the users module (ADR-006): the only way other modules read or change
 * the `users` table. Methods accept the caller's transaction (`tx`), so a use case in
 * another module can change users and its own tables atomically (backend.md §1).
 */
@Injectable()
export class UsersService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly repository: UsersRepository,
  ) {}

  /** A taken email is an expected outcome for the caller, not an exception. */
  async create(
    input: { email: string; passwordHash: string; name: string; timezone: string },
    tx: Executor = this.db,
  ): Promise<CreateUserResult> {
    const result = await this.repository.insert(tx, {
      ...input,
      email: normalizeEmail(input.email),
    });
    return result.status === 'created'
      ? { status: 'created', user: toProfile(result.user) }
      : { status: 'email_taken' };
  }

  async findAccountByEmail(email: string, tx: Executor = this.db): Promise<UserAccount | null> {
    const user = await this.repository.findByEmail(tx, normalizeEmail(email));
    return user ? { ...toProfile(user), passwordHash: user.passwordHash } : null;
  }

  async getProfile(userId: string, tx: Executor = this.db): Promise<UserProfile> {
    const user = await this.repository.findById(tx, userId);
    if (!user) throw new UserNotFoundError();
    return toProfile(user);
  }

  async updateProfile(
    userId: string,
    changes: { name?: string; timezone?: string },
    tx: Executor = this.db,
  ): Promise<UserProfile> {
    const user = await this.repository.update(tx, userId, changes);
    if (!user) throw new UserNotFoundError();
    return toProfile(user);
  }

  async updatePasswordHash(userId: string, passwordHash: string, tx: Executor = this.db) {
    await this.repository.update(tx, userId, { passwordHash });
  }

  /** Idempotent: an already verified email keeps its original time. */
  async markEmailVerified(userId: string, at: Date, tx: Executor = this.db): Promise<void> {
    const user = await this.repository.findById(tx, userId);
    if (user && user.emailVerifiedAt === null) {
      await this.repository.update(tx, userId, { emailVerifiedAt: at });
    }
  }
}
