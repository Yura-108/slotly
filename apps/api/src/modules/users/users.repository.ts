import { Injectable } from '@nestjs/common';
import { eq, inArray } from 'drizzle-orm';
import type { Executor } from '../../infrastructure/database/database.module';
import { type NewUserRow, type UserRow, users } from './users.schema';

export type InsertUserResult = { status: 'created'; user: UserRow } | { status: 'email_taken' };

@Injectable()
export class UsersRepository {
  /**
   * Uniqueness is decided by the database, not by a prior SELECT: two concurrent
   * registrations of one email cannot both pass (CLAUDE.md rule 6).
   * ON CONFLICT DO NOTHING instead of catching 23505: an error would abort the caller's
   * transaction, and registration continues in it (the "account exists" email, ADR-012).
   */
  async insert(db: Executor, row: NewUserRow): Promise<InsertUserResult> {
    const [user] = await db
      .insert(users)
      .values(row)
      .onConflictDoNothing({ target: users.email })
      .returning();
    return user ? { status: 'created', user } : { status: 'email_taken' };
  }

  async findById(db: Executor, id: string): Promise<UserRow | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async findByIds(db: Executor, ids: readonly string[]): Promise<UserRow[]> {
    if (ids.length === 0) return [];
    return db
      .select()
      .from(users)
      .where(inArray(users.id, [...ids]));
  }

  async findByEmail(db: Executor, email: string): Promise<UserRow | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  async update(
    db: Executor,
    id: string,
    changes: Partial<Pick<UserRow, 'name' | 'timezone' | 'passwordHash' | 'emailVerifiedAt'>>,
  ): Promise<UserRow | undefined> {
    const [user] = await db.update(users).set(changes).where(eq(users.id, id)).returning();
    return user;
  }
}
