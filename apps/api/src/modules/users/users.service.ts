import { Inject, Injectable } from '@nestjs/common';
import { DATABASE, type Database } from '../../infrastructure/database/database.module';
import { normalizeEmail } from './domain/email';
import { UserNotFoundError } from './domain/errors';
import { UsersRepository } from './users.repository';

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  timezone: string;
  emailVerified: boolean;
}

export interface UserCredentials {
  id: string;
  passwordHash: string;
}

export type CreateUserResult = { status: 'created'; id: string } | { status: 'email_taken' };

/**
 * Public API of the users module (ADR-006): the only way other modules
 * read or change the `users` table.
 */
@Injectable()
export class UsersService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly repository: UsersRepository,
  ) {}

  /** A taken email is an expected outcome for the caller, not an exception. */
  async create(input: {
    email: string;
    passwordHash: string;
    name: string;
    timezone: string;
  }): Promise<CreateUserResult> {
    const result = await this.repository.insert(this.db, {
      ...input,
      email: normalizeEmail(input.email),
    });
    return result.status === 'created'
      ? { status: 'created', id: result.user.id }
      : { status: 'email_taken' };
  }

  async findCredentialsByEmail(email: string): Promise<UserCredentials | null> {
    const user = await this.repository.findByEmail(this.db, normalizeEmail(email));
    return user ? { id: user.id, passwordHash: user.passwordHash } : null;
  }

  async updatePasswordHash(userId: string, passwordHash: string): Promise<void> {
    await this.repository.updatePasswordHash(this.db, userId, passwordHash);
  }

  async getProfile(userId: string): Promise<UserProfile> {
    const user = await this.repository.findById(this.db, userId);
    if (!user) throw new UserNotFoundError();
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      timezone: user.timezone,
      emailVerified: user.emailVerifiedAt !== null,
    };
  }
}
