CREATE TABLE "context_daily" (
	"date" date PRIMARY KEY NOT NULL,
	"temp_max" real,
	"temp_min" real,
	"precip_mm" real,
	"weather_code" smallint,
	"meeting_count" smallint,
	"meeting_minutes" integer,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "context_daily" ENABLE ROW LEVEL SECURITY;