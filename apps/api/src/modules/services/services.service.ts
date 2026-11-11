import { Inject, Injectable } from '@nestjs/common';
import { DATABASE, type Database } from '../../infrastructure/database/database.module';
import { SpecialistsService } from '../specialists/specialists.service';
import { ServiceArchivedError, ServiceNotFoundError } from './domain/errors';
import type { ServiceRow } from './services.schema';
import { ServicesRepository } from './services.repository';

export interface Service {
  id: string;
  name: string;
  description: string | null;
  durationMinutes: number;
  archived: boolean;
}

const toService = (row: ServiceRow): Service => ({
  id: row.id,
  name: row.name,
  description: row.description,
  durationMinutes: row.durationMinutes,
  archived: row.archivedAt !== null,
});

/** Public API of the services module (ADR-006). */
@Injectable()
export class ServicesService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly repository: ServicesRepository,
    private readonly specialists: SpecialistsService,
  ) {}

  /** The specialist's own list, archived included (they still see past offers). */
  async listOwn(userId: string): Promise<Service[]> {
    const { userId: specialistId } = await this.specialists.requireProfile(userId);
    const rows = await this.repository.listBySpecialist(this.db, specialistId, {
      includeArchived: true,
    });
    return rows.map(toService);
  }

  async create(
    userId: string,
    input: { name: string; description?: string | null; durationMinutes: number },
  ): Promise<Service> {
    const { userId: specialistId } = await this.specialists.requireProfile(userId);
    const row = await this.repository.insert(this.db, {
      specialistId,
      name: input.name,
      description: input.description ?? null,
      durationMinutes: input.durationMinutes,
    });
    return toService(row);
  }

  /**
   * Existing bookings are not affected: they store their own start, end and service name
   * (a snapshot), so a new duration applies only to new bookings (requirements §5).
   */
  async update(
    userId: string,
    serviceId: string,
    changes: { name?: string; description?: string | null; durationMinutes?: number },
  ): Promise<Service> {
    const { userId: specialistId } = await this.specialists.requireProfile(userId);
    const row = await this.repository.updateActive(this.db, serviceId, specialistId, changes);
    if (row) return toService(row);
    // Nothing updated: tell "not yours / missing" (404) from "archived" (422)
    const existing = await this.repository.findOwned(this.db, serviceId, specialistId);
    if (!existing) throw new ServiceNotFoundError();
    throw new ServiceArchivedError();
  }

  /** Idempotent: archiving an archived service is a no-op (FR-21). */
  async archive(userId: string, serviceId: string): Promise<void> {
    const { userId: specialistId } = await this.specialists.requireProfile(userId);
    const archived = await this.repository.archive(this.db, serviceId, specialistId, new Date());
    if (archived) return;
    const existing = await this.repository.findOwned(this.db, serviceId, specialistId);
    if (!existing) throw new ServiceNotFoundError();
  }

  /**
   * An active service of the given specialist, for booking. Archived, foreign and missing
   * services all look missing to clients (404).
   */
  async getActiveOf(specialistId: string, serviceId: string): Promise<Service> {
    const row = await this.repository.findOwned(this.db, serviceId, specialistId);
    if (!row || row.archivedAt) throw new ServiceNotFoundError();
    return toService(row);
  }

  /** What clients see on the public page: active services only. */
  async listPublic(slug: string): Promise<Service[]> {
    const { userId: specialistId } = await this.specialists.getBySlug(slug);
    const rows = await this.repository.listBySpecialist(this.db, specialistId, {
      includeArchived: false,
    });
    return rows.map(toService);
  }
}
