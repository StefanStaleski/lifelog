CREATE TABLE "portrait_frames" (
	"idx" smallint PRIMARY KEY NOT NULL,
	"mime" text NOT NULL,
	"bytes" "bytea" NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "portrait_frames_idx" CHECK ("portrait_frames"."idx" between 0 and 35)
);
--> statement-breakpoint
ALTER TABLE "portrait_frames" ENABLE ROW LEVEL SECURITY;