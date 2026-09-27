CREATE TABLE "bank_parsers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"source" text NOT NULL,
	"match" text NOT NULL,
	"pattern" text NOT NULL,
	"currency" text NOT NULL,
	"decimal" text NOT NULL,
	"direction" text DEFAULT 'debit' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bank_parsers_source" CHECK ("bank_parsers"."source" in ('notification', 'sms')),
	CONSTRAINT "bank_parsers_decimal" CHECK ("bank_parsers"."decimal" in (',', '.')),
	CONSTRAINT "bank_parsers_direction" CHECK ("bank_parsers"."direction" in ('debit', 'credit'))
);
--> statement-breakpoint
ALTER TABLE "bank_parsers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "spending_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pattern" text NOT NULL,
	"category" text NOT NULL,
	"priority" integer DEFAULT 100 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "spending_rules" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "transactions" (
	"event_id" uuid PRIMARY KEY NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"currency" text NOT NULL,
	"direction" text NOT NULL,
	"merchant" text,
	"category" text NOT NULL,
	"raw_hash" text NOT NULL,
	CONSTRAINT "transactions_raw_hash_unique" UNIQUE("raw_hash")
);
--> statement-breakpoint
ALTER TABLE "transactions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "daily_summary" ADD COLUMN "spend_mkd" integer;--> statement-breakpoint
CREATE INDEX "transactions_occurred_at_idx" ON "transactions" USING btree ("occurred_at");