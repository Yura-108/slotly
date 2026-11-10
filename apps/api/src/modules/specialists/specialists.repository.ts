import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import type { Executor } from '../../infrastructure/database/database.module';
import { PgErrorCode, pgConstraint, pgErrorCode } from '../../infrastructure/database/pg-errors';
import { SlugTakenError, SpecialistProfileExistsError } from './domain/errors';
import {
  type NewSpecialistProfileRow,
  type SpecialistProfileRow,
  specialistProfiles,
} from './specialists.schema';

type ProfileChanges = Partial<Omit<SpecialistProfileRow, 'userId' | 'createdAt' | 'updatedAt'>>;

/**
 * Both uniqueness rules are enforced by the database (CLAUDE.md rule 6); the constraint
 * name tells which one was hit. Nothing else runs in these transactions, so a 23505
 * can be thrown as a domain error (compare users.repository, which must keep its tx alive).
 */
function translateUniqueViolation(error: unknown): never {
  if (pgErrorCode(error) === PgErrorCode.uniqueViolation) {
    const constraint = pgConstraint(error);
    if (constraint === 'specialist_profiles_slug_unique') throw new SlugTakenError();
    if (constraint === 'specialist_profiles_pkey') throw new SpecialistProfileExistsError();
  }
  throw error;
}

@Injectable()
export class SpecialistsRepository {
  async insert(db: Executor, row: NewSpecialistProfileRow): Promise<SpecialistProfileRow> {
    try {
      const [profile] = await db.insert(specialistProfiles).values(row).returning();
      if (!profile) throw new Error('INSERT ... RETURNING returned no row');
      return profile;
    } catch (error) {
      translateUniqueViolation(error);
    }
  }

  async update(
    db: Executor,
    userId: string,
    changes: ProfileChanges,
  ): Promise<SpecialistProfileRow | undefined> {
    try {
      const [profile] = await db
        .update(specialistProfiles)
        .set(changes)
        .where(eq(specialistProfiles.userId, userId))
        .returning();
      return profile;
    } catch (error) {
      translateUniqueViolation(error);
    }
  }

  async findByUserId(db: Executor, userId: string): Promise<SpecialistProfileRow | undefined> {
    const [profile] = await db
      .select()
      .from(specialistProfiles)
      .where(eq(specialistProfiles.userId, userId));
    return profile;
  }

  async findBySlug(db: Executor, slug: string): Promise<SpecialistProfileRow | undefined> {
    const [profile] = await db
      .select()
      .from(specialistProfiles)
      .where(eq(specialistProfiles.slug, slug));
    return profile;
  }
}
