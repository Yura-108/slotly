// Drizzle schema entry point. Each module owns its tables (ADR-006) and is re-exported here.
export * from '../../modules/users/users.schema';
export * from '../../modules/specialists/specialists.schema';
export * from '../../modules/services/services.schema';
export * from '../../modules/bookings/bookings.schema';
export * from '../../modules/auth/sessions.schema';
