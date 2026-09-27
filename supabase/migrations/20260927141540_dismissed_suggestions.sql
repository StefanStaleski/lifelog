CREATE TABLE "dismissed_suggestions" (
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dismissed_suggestions_lat_lng_pk" PRIMARY KEY("lat","lng")
);
--> statement-breakpoint
ALTER TABLE "dismissed_suggestions" ENABLE ROW LEVEL SECURITY;