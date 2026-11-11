import { Injectable } from '@nestjs/common';
import { and, asc, eq, isNull } from 'drizzle-orm';
import type { Executor } from '../../infrastructure/database/database.module';
import { type ServiceRow, services } from './services.schema';

type ServiceChanges = Partial<Pick<ServiceRow, 'name' | 'description' | 'durationMinutes'>>;

/**
 * Every query on one service carries the owner condition: "load by id, then compare the
 * owner" can be forgotten in one place; here a query without an owner cannot be written.
 */
const owned = (id: string, specialistId: string) =>
  and(eq(services.id, id), eq(services.specialistId, specialistId));

@Injectable()
export class ServicesRepository {
  async insert(
    db: Executor,
    row: {
      specialistId: string;
      name: string;
      description: string | null;
      durationMinutes: number;
    },
  ): Promise<ServiceRow> {
    const [service] = await db.insert(services).values(row).returning();
    if (!service) throw new Error('INSERT ... RETURNING returned no row');
    return service;
  }

  async listBySpecialist(
    db: Executor,
    specialistId: string,
    options: { includeArchived: boolean },
  ): Promise<ServiceRow[]> {
    return db
      .select()
      .from(services)
      .where(
        options.includeArchived
          ? eq(services.specialistId, specialistId)
          : and(eq(services.specialistId, specialistId), isNull(services.archivedAt)),
      )
      .orderBy(asc(services.createdAt));
  }

  async findActiveById(db: Executor, id: string): Promise<ServiceRow | undefined> {
    const [service] = await db
      .select()
      .from(services)
      .where(and(eq(services.id, id), isNull(services.archivedAt)));
    return service;
  }

  async findOwned(db: Executor, id: string, specialistId: string) {
    const [service] = await db.select().from(services).where(owned(id, specialistId));
    return service;
  }

  /** Changes only an active service; undefined when it is missing, foreign or archived. */
  async updateActive(
    db: Executor,
    id: string,
    specialistId: string,
    changes: ServiceChanges,
  ): Promise<ServiceRow | undefined> {
    const [service] = await db
      .update(services)
      .set(changes)
      .where(and(owned(id, specialistId), isNull(services.archivedAt)))
      .returning();
    return service;
  }

  /** Returns false when nothing changed (missing, foreign or already archived). */
  async archive(db: Executor, id: string, specialistId: string, now: Date): Promise<boolean> {
    const rows = await db
      .update(services)
      .set({ archivedAt: now })
      .where(and(owned(id, specialistId), isNull(services.archivedAt)))
      .returning({ id: services.id });
    return rows.length > 0;
  }
}
