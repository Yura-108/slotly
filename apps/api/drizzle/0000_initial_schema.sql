CREATE TYPE "public"."confirmation_mode" AS ENUM('auto', 'manual');--> statement-breakpoint
CREATE TYPE "public"."booking_actor" AS ENUM('client', 'specialist');--> statement-breakpoint
CREATE TYPE "public"."booking_status" AS ENUM('pending', 'confirmed', 'rejected', 'cancelled', 'expired');--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"name" text NOT NULL,
	"timezone" text NOT NULL,
	"email_verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_email_lowercase" CHECK ("users"."email" = lower("users"."email")),
	CONSTRAINT "users_name_length" CHECK (char_length("users"."name") between 1 and 100)
);
--> statement-breakpoint
CREATE TABLE "specialist_profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"display_name" text NOT NULL,
	"bio" text,
	"timezone" text NOT NULL,
	"confirmation_mode" "confirmation_mode" DEFAULT 'manual' NOT NULL,
	"min_notice_minutes" integer DEFAULT 120 NOT NULL,
	"booking_horizon_days" integer DEFAULT 60 NOT NULL,
	"client_cancel_deadline_hours" integer DEFAULT 24 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "specialist_profiles_slug_unique" UNIQUE("slug"),
	CONSTRAINT "specialist_profiles_slug_format" CHECK ("specialist_profiles"."slug" ~ '^[a-z0-9-]{3,40}$'),
	CONSTRAINT "specialist_profiles_min_notice_range" CHECK ("specialist_profiles"."min_notice_minutes" between 0 and 10080),
	CONSTRAINT "specialist_profiles_horizon_range" CHECK ("specialist_profiles"."booking_horizon_days" between 1 and 365),
	CONSTRAINT "specialist_profiles_cancel_deadline_range" CHECK ("specialist_profiles"."client_cancel_deadline_hours" between 0 and 720)
);
--> statement-breakpoint
CREATE TABLE "services" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"specialist_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"duration_minutes" integer NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "services_name_length" CHECK (char_length("services"."name") between 1 and 100),
	CONSTRAINT "services_duration_valid" CHECK ("services"."duration_minutes" between 15 and 480 and "services"."duration_minutes" % 5 = 0)
);
--> statement-breakpoint
CREATE TABLE "bookings" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"specialist_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"service_id" uuid NOT NULL,
	"service_name" text NOT NULL,
	"start_at" timestamp with time zone NOT NULL,
	"end_at" timestamp with time zone NOT NULL,
	"status" "booking_status" NOT NULL,
	"expires_at" timestamp with time zone,
	"cancelled_by" "booking_actor",
	"status_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bookings_end_after_start" CHECK ("bookings"."end_at" > "bookings"."start_at"),
	CONSTRAINT "bookings_not_self" CHECK ("bookings"."client_id" <> "bookings"."specialist_id"),
	CONSTRAINT "bookings_expires_only_pending" CHECK (("bookings"."status" = 'pending') = ("bookings"."expires_at" is not null)),
	CONSTRAINT "bookings_cancelled_by_only_cancelled" CHECK (("bookings"."status" = 'cancelled') = ("bookings"."cancelled_by" is not null)),
	CONSTRAINT "bookings_status_reason_length" CHECK (char_length("bookings"."status_reason") <= 500)
);
--> statement-breakpoint
ALTER TABLE "specialist_profiles" ADD CONSTRAINT "specialist_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "services" ADD CONSTRAINT "services_specialist_id_specialist_profiles_user_id_fk" FOREIGN KEY ("specialist_id") REFERENCES "public"."specialist_profiles"("user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_specialist_id_specialist_profiles_user_id_fk" FOREIGN KEY ("specialist_id") REFERENCES "public"."specialist_profiles"("user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_client_id_users_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "services_active_by_specialist_idx" ON "services" USING btree ("specialist_id") WHERE "services"."archived_at" is null;--> statement-breakpoint
CREATE INDEX "bookings_client_start_idx" ON "bookings" USING btree ("client_id","start_at");--> statement-breakpoint
CREATE INDEX "bookings_specialist_start_idx" ON "bookings" USING btree ("specialist_id","start_at");--> statement-breakpoint
CREATE INDEX "bookings_pending_expiry_idx" ON "bookings" USING btree ("expires_at") WHERE "bookings"."status" = 'pending';