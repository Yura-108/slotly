-- The client cancellation deadline becomes part of the booking (FR-53): the client agreed to
-- the specialist's rule at booking time; later changes to the setting do not apply.
-- Three steps, because existing rows need a value before the column can be NOT NULL.
ALTER TABLE "bookings" ADD COLUMN "cancel_deadline_at" timestamp with time zone;--> statement-breakpoint
-- One-time backfill from the current setting: the rule at booking time was not recorded.
-- A data migration may read another module's table; application code may not (ADR-006).
UPDATE "bookings" AS b
SET "cancel_deadline_at" = b."start_at" - make_interval(hours => sp."client_cancel_deadline_hours")
FROM "specialist_profiles" AS sp
WHERE sp."user_id" = b."specialist_id";--> statement-breakpoint
ALTER TABLE "bookings" ALTER COLUMN "cancel_deadline_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_cancel_deadline_not_after_start" CHECK ("bookings"."cancel_deadline_at" <= "bookings"."start_at");
