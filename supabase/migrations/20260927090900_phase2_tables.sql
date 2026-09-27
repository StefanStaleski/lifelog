CREATE TABLE "activity_segments" (
	"started_at" timestamp with time zone PRIMARY KEY NOT NULL,
	"ended_at" timestamp with time zone,
	"kind" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "activity_segments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "location_stays" (
	"event_id" uuid PRIMARY KEY NOT NULL,
	"arrived_at" timestamp with time zone NOT NULL,
	"left_at" timestamp with time zone NOT NULL,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL
);
--> statement-breakpoint
ALTER TABLE "location_stays" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "places" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"radius_m" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "places_kind" CHECK ("places"."kind" in ('home', 'work', 'gym', 'other')),
	CONSTRAINT "places_radius" CHECK ("places"."radius_m" between 50 and 2000)
);
--> statement-breakpoint
ALTER TABLE "places" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "screen_events" (
	"event_id" uuid PRIMARY KEY NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"state" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "screen_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "sleep_estimates" (
	"date" date PRIMARY KEY NOT NULL,
	"sleep_start" timestamp with time zone NOT NULL,
	"wake_at" timestamp with time zone NOT NULL,
	"duration_min" integer NOT NULL,
	"confidence" real NOT NULL,
	"corrected" boolean DEFAULT false NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sleep_estimates" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "steps_hourly" (
	"hour" timestamp with time zone PRIMARY KEY NOT NULL,
	"steps" integer NOT NULL,
	"distance_m" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "steps_hourly" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "visits" (
	"place_id" uuid NOT NULL,
	"arrived_at" timestamp with time zone NOT NULL,
	"left_at" timestamp with time zone,
	CONSTRAINT "visits_place_id_arrived_at_pk" PRIMARY KEY("place_id","arrived_at")
);
--> statement-breakpoint
ALTER TABLE "visits" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "daily_summary" ADD COLUMN "steps" integer;--> statement-breakpoint
ALTER TABLE "daily_summary" ADD COLUMN "distance_m" integer;--> statement-breakpoint
ALTER TABLE "daily_summary" ADD COLUMN "sleep_min" integer;--> statement-breakpoint
ALTER TABLE "daily_summary" ADD COLUMN "sleep_confidence" real;--> statement-breakpoint
ALTER TABLE "daily_summary" ADD COLUMN "home_min" integer;--> statement-breakpoint
ALTER TABLE "daily_summary" ADD COLUMN "work_min" integer;--> statement-breakpoint
ALTER TABLE "daily_summary" ADD COLUMN "gym_min" integer;--> statement-breakpoint
ALTER TABLE "daily_summary" ADD COLUMN "other_places_min" integer;--> statement-breakpoint
CREATE INDEX "location_stays_arrived_at_idx" ON "location_stays" USING btree ("arrived_at");--> statement-breakpoint
CREATE INDEX "screen_events_occurred_at_idx" ON "screen_events" USING btree ("occurred_at");