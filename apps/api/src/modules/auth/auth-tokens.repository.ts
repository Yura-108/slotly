import { Injectable } from '@nestjs/common';
import { and, eq, gt, inArray, isNull, lte } from 'drizzle-orm';
import type { Executor } from '../../infrastructure/database/database.module';
import { authTokens, type AuthTokenPurpose } from './auth-tokens.schema';

@Injectable()
export class AuthTokensRepository {
  async insert(
    db: Executor,
    row: { userId: string; purpose: AuthTokenPurpose; tokenHash: Buffer; expiresAt: Date },
  ): Promise<void> {
    await db.insert(authTokens).values(row);
  }

  /**
   * Compare-and-set consumption: of two concurrent requests with one token, exactly one
   * gets the row back. Returns the owner, or null for unknown, expired or used tokens.
   */
  /**
   * Cleanup: up to `limit` tokens past their expiry, used or not — after it they can only
   * be rejected; returns how many were deleted.
   */
  async deleteExpired(db: Executor, now: Date, limit: number): Promise<number> {
    const batch = db
      .select({ id: authTokens.id })
      .from(authTokens)
      .where(lte(authTokens.expiresAt, now))
      .limit(limit);
    const deleted = await db
      .delete(authTokens)
      .where(inArray(authTokens.id, batch))
      .returning({ id: authTokens.id });
    return deleted.length;
  }

  async consume(
    db: Executor,
    params: { tokenHash: Buffer; purpose: AuthTokenPurpose; now: Date },
  ): Promise<{ userId: string } | null> {
    const [row] = await db
      .update(authTokens)
      .set({ usedAt: params.now })
      .where(
        and(
          eq(authTokens.tokenHash, params.tokenHash),
          eq(authTokens.purpose, params.purpose),
          isNull(authTokens.usedAt),
          gt(authTokens.expiresAt, params.now),
        ),
      )
      .returning({ userId: authTokens.userId });
    return row ?? null;
  }

  /** A new link makes older unused links of the same purpose useless. */
  async revokeUnused(
    db: Executor,
    params: { userId: string; purpose: AuthTokenPurpose; now: Date },
  ): Promise<void> {
    await db
      .update(authTokens)
      .set({ usedAt: params.now })
      .where(
        and(
          eq(authTokens.userId, params.userId),
          eq(authTokens.purpose, params.purpose),
          isNull(authTokens.usedAt),
        ),
      );
  }
}
