CREATE TABLE "app_usage" (
	"date" date NOT NULL,
	"package" text NOT NULL,
	"app_label" text NOT NULL,
	"category" text,
	"foreground_ms" bigint NOT NULL,
	"launches" integer NOT NULL,
	CONSTRAINT "app_usage_date_package_pk" PRIMARY KEY("date","package")
);
--> statement-breakpoint
ALTER TABLE "app_usage" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "checkins" (
	"date" date PRIMARY KEY NOT NULL,
	"mood" smallint NOT NULL,
	"energy" smallint NOT NULL,
	"focus" smallint NOT NULL,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"note" text,
	"event_id" uuid NOT NULL,
	"submitted_at" timestamp with time zone NOT NULL,
	CONSTRAINT "checkins_mood_range" CHECK ("checkins"."mood" between 1 and 5),
	CONSTRAINT "checkins_energy_range" CHECK ("checkins"."energy" between 1 and 5),
	CONSTRAINT "checkins_focus_range" CHECK ("checkins"."focus" between 1 and 5)
);
--> statement-breakpoint
ALTER TABLE "checkins" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "daily_summary" (
	"date" date PRIMARY KEY NOT NULL,
	"screen_time_min" integer,
	"unlocks" integer,
	"first_unlock_at" timestamp with time zone,
	"last_unlock_at" timestamp with time zone,
	"mood" smallint,
	"energy" smallint,
	"focus" smallint,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "daily_summary" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"payload" jsonb NOT NULL,
	"device_id" text NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "source_health" (
	"source" text PRIMARY KEY NOT NULL,
	"last_event_at" timestamp with time zone NOT NULL,
	"last_error" text,
	"details" jsonb,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "source_health" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "unlocks" (
	"event_id" uuid PRIMARY KEY NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "unlocks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX "events_type_occurred_at_idx" ON "events" USING btree ("type","occurred_at");--> statement-breakpoint
CREATE INDEX "events_received_at_idx" ON "events" USING btree ("received_at");--> statement-breakpoint
CREATE INDEX "events_unprocessed_idx" ON "events" USING btree ("received_at") WHERE "events"."processed_at" is null;--> statement-breakpoint
CREATE INDEX "unlocks_occurred_at_idx" ON "unlocks" USING btree ("occurred_at");