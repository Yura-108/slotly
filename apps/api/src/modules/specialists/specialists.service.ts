import { Inject, Injectable, Logger } from '@nestjs/common';
import { DATABASE, type Database } from '../../infrastructure/database/database.module';
import { UsersService } from '../users/users.service';
import {
  EmailNotVerifiedError,
  SpecialistNotFoundError,
  SpecialistProfileRequiredError,
} from './domain/errors';
import type { ConfirmationMode, SpecialistProfileRow } from './specialists.schema';
import { SpecialistsRepository } from './specialists.repository';

export interface SpecialistProfile {
  userId: string;
  slug: string;
  displayName: string;
  bio: string | null;
  timezone: string;
  confirmationMode: ConfirmationMode;
  minNoticeMinutes: number;
  bookingHorizonDays: number;
  clientCancelDeadlineHours: number;
}

export interface BookingSettings {
  confirmationMode: ConfirmationMode;
  minNoticeMinutes: number;
  bookingHorizonDays: number;
  clientCancelDeadlineHours: number;
}

export type ProfileInput = {
  slug: string;
  displayName: string;
  bio?: string | null;
  timezone?: string;
} & Partial<BookingSettings>;

const toProfile = (row: SpecialistProfileRow): SpecialistProfile => ({
  userId: row.userId,
  slug: row.slug,
  displayName: row.displayName,
  bio: row.bio,
  timezone: row.timezone,
  confirmationMode: row.confirmationMode,
  minNoticeMinutes: row.minNoticeMinutes,
  bookingHorizonDays: row.bookingHorizonDays,
  clientCancelDeadlineHours: row.clientCancelDeadlineHours,
});

/** Public API of the specialists module (ADR-006). */
@Injectable()
export class SpecialistsService {
  private readonly logger = new Logger(SpecialistsService.name);

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly repository: SpecialistsRepository,
    private readonly users: UsersService,
  ) {}

  /** FR-10. Only a confirmed email may open a public page (FR-2). */
  async enable(userId: string, input: ProfileInput): Promise<SpecialistProfile> {
    const user = await this.users.getProfile(userId);
    if (!user.emailVerified) throw new EmailNotVerifiedError();

    const row = await this.repository.insert(this.db, {
      userId,
      slug: input.slug,
      displayName: input.displayName,
      bio: input.bio ?? null,
      // The schedule is interpreted in this zone; the user's own zone is the natural default
      timezone: input.timezone ?? user.timezone,
      confirmationMode: input.confirmationMode,
      minNoticeMinutes: input.minNoticeMinutes,
      bookingHorizonDays: input.bookingHorizonDays,
      clientCancelDeadlineHours: input.clientCancelDeadlineHours,
    });
    this.logger.log({ userId }, 'Specialist profile enabled');
    return toProfile(row);
  }

  async update(userId: string, changes: Partial<ProfileInput>): Promise<SpecialistProfile> {
    const row = await this.repository.update(this.db, userId, changes);
    if (!row) throw new SpecialistProfileRequiredError();
    return toProfile(row);
  }

  /** Null when the user has not enabled the profile — a normal state, not an error. */
  async findOwn(userId: string): Promise<SpecialistProfile | null> {
    const row = await this.repository.findByUserId(this.db, userId);
    return row ? toProfile(row) : null;
  }

  /** For use cases that only a specialist may run (services, schedule). */
  async requireProfile(userId: string): Promise<SpecialistProfile> {
    const profile = await this.findOwn(userId);
    if (!profile) throw new SpecialistProfileRequiredError();
    return profile;
  }

  async getBySlug(slug: string): Promise<SpecialistProfile> {
    const row = await this.repository.findBySlug(this.db, slug);
    if (!row) throw new SpecialistNotFoundError();
    return toProfile(row);
  }
}
