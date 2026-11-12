import { Injectable } from '@nestjs/common';
import { eq, inArray, lte } from 'drizzle-orm';
import type { Executor } from '../../infrastructure/database/database.module';
import { type NewSessionRow, type SessionRow, sessions } from './sessions.schema';

@Injectable()
export class SessionsRepository {
  async insert(db: Executor, row: NewSessionRow): Promise<SessionRow> {
    const [session] = await db.insert(sessions).values(row).returning();
    if (!session) throw new Error('INSERT ... RETURNING returned no row');
    return session;
  }

  async findByTokenHash(db: Executor, tokenHash: Buffer): Promise<SessionRow | undefined> {
    const [session] = await db.select().from(sessions).where(eq(sessions.tokenHash, tokenHash));
    return session;
  }

  async refresh(
    db: Executor,
    id: string,
    times: { lastSeenAt: Date; expiresAt: Date },
  ): Promise<void> {
    await db.update(sessions).set(times).where(eq(sessions.id, id));
  }

  async deleteById(db: Executor, id: string): Promise<void> {
    await db.delete(sessions).where(eq(sessions.id, id));
  }

  /** Password change or reset ends every session of the user (ADR-005). */
  /** Cleanup: up to `limit` sessions past their expiry; returns how many were deleted. */
  async deleteExpired(db: Executor, now: Date, limit: number): Promise<number> {
    const batch = db
      .select({ id: sessions.id })
      .from(sessions)
      .where(lte(sessions.expiresAt, now))
      .limit(limit);
    const deleted = await db
      .delete(sessions)
      .where(inArray(sessions.id, batch))
      .returning({ id: sessions.id });
    return deleted.length;
  }

  async deleteAllForUser(db: Executor, userId: string): Promise<void> {
    await db.delete(sessions).where(eq(sessions.userId, userId));
  }

  async deleteByTokenHash(db: Executor, tokenHash: Buffer): Promise<void> {
    await db.delete(sessions).where(eq(sessions.tokenHash, tokenHash));
  }
}
