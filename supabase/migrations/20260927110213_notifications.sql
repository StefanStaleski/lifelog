CREATE TABLE "notifications_hourly" (
	"hour" timestamp with time zone NOT NULL,
	"package" text NOT NULL,
	"app_label" text NOT NULL,
	"count" integer NOT NULL,
	CONSTRAINT "notifications_hourly_hour_package_pk" PRIMARY KEY("hour","package")
);
--> statement-breakpoint
ALTER TABLE "notifications_hourly" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "daily_summary" ADD COLUMN "notifications" integer;