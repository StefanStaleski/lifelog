CREATE TABLE "app_tags" (
	"source" text NOT NULL,
	"key" text NOT NULL,
	"is_work" boolean NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "app_tags_source_key_pk" PRIMARY KEY("source","key"),
	CONSTRAINT "app_tags_source" CHECK ("app_tags"."source" in ('phone', 'desktop', 'host'))
);
--> statement-breakpoint
ALTER TABLE "app_tags" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app_usage_windows" (
	"window_start" timestamp with time zone NOT NULL,
	"package" text NOT NULL,
	"foreground_ms" integer NOT NULL,
	CONSTRAINT "app_usage_windows_window_start_package_pk" PRIMARY KEY("window_start","package")
);
--> statement-breakpoint
ALTER TABLE "app_usage_windows" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "calls" (
	"id" uuid PRIMARY KEY NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"direction" text NOT NULL,
	"duration_s" integer NOT NULL,
	"contact_hash" text NOT NULL,
	"contact_name" text,
	CONSTRAINT "calls_direction" CHECK ("calls"."direction" in ('incoming', 'outgoing', 'missed', 'rejected'))
);
--> statement-breakpoint
ALTER TABLE "calls" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "desktop_usage" (
	"window_start" timestamp with time zone NOT NULL,
	"app" text NOT NULL,
	"host" text DEFAULT '' NOT NULL,
	"active_ms" integer NOT NULL,
	"device_id" text NOT NULL,
	CONSTRAINT "desktop_usage_window_start_app_host_pk" PRIMARY KEY("window_start","app","host")
);
--> statement-breakpoint
ALTER TABLE "desktop_usage" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "message_counts" (
	"hour" timestamp with time zone NOT NULL,
	"package" text NOT NULL,
	"app_label" text NOT NULL,
	"sender_hash" text NOT NULL,
	"sender_name" text NOT NULL,
	"conversation" text,
	"count" integer NOT NULL,
	CONSTRAINT "message_counts_hour_package_sender_hash_pk" PRIMARY KEY("hour","package","sender_hash")
);
--> statement-breakpoint
ALTER TABLE "message_counts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "people" (
	"contact_hash" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"display_name" text,
	"label" text,
	"hidden" boolean DEFAULT false NOT NULL,
	"first_seen_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL,
	CONSTRAINT "people_kind" CHECK ("people"."kind" in ('phone', 'messaging'))
);
--> statement-breakpoint
ALTER TABLE "people" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "server_secrets" (
	"id" smallint PRIMARY KEY DEFAULT 1 NOT NULL,
	"contact_salt" text DEFAULT encode(extensions.gen_random_bytes(32), 'hex') NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "server_secrets_single_row" CHECK ("server_secrets"."id" = 1)
);
--> statement-breakpoint
ALTER TABLE "server_secrets" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "sms_messages" (
	"id" uuid PRIMARY KEY NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"direction" text NOT NULL,
	"contact_hash" text NOT NULL,
	"contact_name" text,
	CONSTRAINT "sms_messages_direction" CHECK ("sms_messages"."direction" in ('in', 'out'))
);
--> statement-breakpoint
ALTER TABLE "sms_messages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "work_settings" (
	"id" smallint PRIMARY KEY DEFAULT 1 NOT NULL,
	"days" integer[] DEFAULT '{1,2,3,4,5}'::integer[] NOT NULL,
	"start_local" time DEFAULT '09:00' NOT NULL,
	"end_local" time DEFAULT '17:00' NOT NULL,
	"untagged_desktop_is_work" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "work_settings_single_row" CHECK ("work_settings"."id" = 1),
	CONSTRAINT "work_settings_days" CHECK ("work_settings"."days" <@ '{1,2,3,4,5,6,7}'::integer[]),
	CONSTRAINT "work_settings_hours" CHECK ("work_settings"."start_local" < "work_settings"."end_local")
);
--> statement-breakpoint
ALTER TABLE "work_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "daily_summary" ADD COLUMN "worked_min" integer;--> statement-breakpoint
ALTER TABLE "daily_summary" ADD COLUMN "worked_in_hours_min" integer;--> statement-breakpoint
ALTER TABLE "daily_summary" ADD COLUMN "worked_after_hours_min" integer;--> statement-breakpoint
ALTER TABLE "daily_summary" ADD COLUMN "first_work_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "daily_summary" ADD COLUMN "last_work_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "daily_summary" ADD COLUMN "desktop_min" integer;--> statement-breakpoint
ALTER TABLE "daily_summary" ADD COLUMN "wfh_min" integer;--> statement-breakpoint
ALTER TABLE "daily_summary" ADD COLUMN "calls" integer;--> statement-breakpoint
ALTER TABLE "daily_summary" ADD COLUMN "call_min" integer;--> statement-breakpoint
ALTER TABLE "daily_summary" ADD COLUMN "people_contacted" integer;--> statement-breakpoint
ALTER TABLE "daily_summary" ADD COLUMN "messages_received" integer;--> statement-breakpoint
CREATE INDEX "calls_occurred_at_idx" ON "calls" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "calls_contact_hash_idx" ON "calls" USING btree ("contact_hash");--> statement-breakpoint
CREATE INDEX "message_counts_sender_hash_idx" ON "message_counts" USING btree ("sender_hash");--> statement-breakpoint
CREATE INDEX "sms_messages_occurred_at_idx" ON "sms_messages" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "sms_messages_contact_hash_idx" ON "sms_messages" USING btree ("contact_hash");