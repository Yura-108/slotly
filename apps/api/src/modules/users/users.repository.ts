import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import type { Executor } from '../../infrastructure/database/database.module';
import { PgErrorCode, pgConstraint, pgErrorCode } from '../../infrastructure/database/pg-errors';
import { type NewUserRow, type UserRow, users } from './users.schema';

export type InsertUserResult = { status: 'created'; user: UserRow } | { status: 'email_taken' };

@Injectable()
export class UsersRepository {
  /**
   * Uniqueness is decided by the database, not by a prior SELECT: two concurrent
   * registrations of one email cannot both pass (CLAUDE.md rule 6).
   */
  async insert(db: Executor, row: NewUserRow): Promise<InsertUserResult> {
    try {
      const [user] = await db.insert(users).values(row).returning();
      if (!user) throw new Error('INSERT ... RETURNING returned no row');
      return { status: 'created', user };
    } catch (error) {
      if (
        pgErrorCode(error) === PgErrorCode.uniqueViolation &&
        pgConstraint(error) === 'users_email_unique'
      ) {
        return { status: 'email_taken' };
      }
      throw error;
    }
  }

  async findById(db: Executor, id: string): Promise<UserRow | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async findByEmail(db: Executor, email: string): Promise<UserRow | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  async updatePasswordHash(db: Executor, id: string, passwordHash: string): Promise<void> {
    await db.update(users).set({ passwordHash }).where(eq(users.id, id));
  }
}
