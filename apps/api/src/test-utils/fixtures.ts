import { randomUUID } from 'node:crypto';
import type { Database } from '../infrastructure/database/database.module';
import { services, specialistProfiles, users } from '../infrastructure/database/schema';

const uniqueSuffix = () => randomUUID().slice(0, 8);

export async function createUser(db: Database): Promise<{ id: string }> {
  const [user] = await db
    .insert(users)
    .values({
      email: `user-${uniqueSuffix()}@example.test`,
      passwordHash: 'not-a-real-hash',
      name: 'Test User',
      timezone: 'Europe/Moscow',
    })
    .returning({ id: users.id });
  if (!user) throw new Error('failed to create user');
  return user;
}

export async function createSpecialistWithService(
  db: Database,
  durationMinutes = 60,
): Promise<{ specialistId: string; serviceId: string; serviceName: string }> {
  const { id: specialistId } = await createUser(db);
  await db.insert(specialistProfiles).values({
    userId: specialistId,
    slug: `spec-${uniqueSuffix()}`,
    displayName: 'Test Specialist',
    timezone: 'Europe/Moscow',
  });
  const serviceName = 'Консультация';
  const [service] = await db
    .insert(services)
    .values({ specialistId, name: serviceName, durationMinutes })
    .returning({ id: services.id });
  if (!service) throw new Error('failed to create service');
  return { specialistId, serviceId: service.id, serviceName };
}
