CREATE TABLE "days_off" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"specialist_id" uuid NOT NULL,
	"date" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "days_off_specialist_date_unique" UNIQUE("specialist_id","date")
);
--> statement-breakpoint
CREATE TABLE "weekly_availability" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"specialist_id" uuid NOT NULL,
	"weekday" smallint NOT NULL,
	"start_minute" smallint NOT NULL,
	"end_minute" smallint NOT NULL,
	CONSTRAINT "weekly_availability_weekday_range" CHECK ("weekly_availability"."weekday" between 1 and 7),
	CONSTRAINT "weekly_availability_start_range" CHECK ("weekly_availability"."start_minute" between 0 and 1439),
	CONSTRAINT "weekly_availability_end_range" CHECK ("weekly_availability"."end_minute" between 1 and 1440 and "weekly_availability"."end_minute" > "weekly_availability"."start_minute")
);
--> statement-breakpoint
ALTER TABLE "days_off" ADD CONSTRAINT "days_off_specialist_id_specialist_profiles_user_id_fk" FOREIGN KEY ("specialist_id") REFERENCES "public"."specialist_profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_availability" ADD CONSTRAINT "weekly_availability_specialist_id_specialist_profiles_user_id_fk" FOREIGN KEY ("specialist_id") REFERENCES "public"."specialist_profiles"("user_id") ON DELETE cascade ON UPDATE no action;