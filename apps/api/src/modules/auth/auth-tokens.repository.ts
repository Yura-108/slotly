import { Injectable } from '@nestjs/common';
import { and, eq, gt, isNull } from 'drizzle-orm';
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
