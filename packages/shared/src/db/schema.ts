import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * Postgres schema (Supabase). RLS is enabled on every table with no policies:
 * only server code using the service role / direct connection can read or write.
 * All timestamps are timestamptz (UTC); `date` columns are local dates in Europe/Skopje.
 */

const tstz = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

/** Append-only log of everything the phone sends. Typed tables below are derived from it. */
export const events = pgTable(
  "events",
  {
    id: uuid("id").primaryKey(), // generated on the device
    type: text("type").notNull(),
    occurredAt: tstz("occurred_at").notNull(),
    endedAt: tstz("ended_at"),
    payload: jsonb("payload").notNull(),
    deviceId: text("device_id").notNull(),
    receivedAt: tstz("received_at").notNull().defaultNow(),
    processedAt: tstz("processed_at"),
  },
  (t) => [
    index("events_type_occurred_at_idx").on(t.type, t.occurredAt),
    index("events_received_at_idx").on(t.receivedAt),
    index("events_unprocessed_idx")
      .on(t.receivedAt)
      .where(sql`${t.processedAt} is null`),
  ],
).enableRLS();

/** Foreground time per app per local day, recomputed from app_usage events. */
export const appUsage = pgTable(
  "app_usage",
  {
    date: date("date", { mode: "string" }).notNull(),
    package: text("package").notNull(),
    appLabel: text("app_label").notNull(),
    category: text("category"),
    foregroundMs: bigint("foreground_ms", { mode: "number" }).notNull(),
    launches: integer("launches").notNull(),
  },
  (t) => [primaryKey({ columns: [t.date, t.package] })],
).enableRLS();

export const unlocks = pgTable(
  "unlocks",
  {
    eventId: uuid("event_id").primaryKey(),
    occurredAt: tstz("occurred_at").notNull(),
  },
  (t) => [index("unlocks_occurred_at_idx").on(t.occurredAt)],
).enableRLS();

/** One check-in per local day; a later submission for the same date replaces the earlier one. */
export const checkins = pgTable(
  "checkins",
  {
    date: date("date", { mode: "string" }).primaryKey(),
    mood: smallint("mood").notNull(),
    energy: smallint("energy").notNull(),
    focus: smallint("focus").notNull(),
    tags: text("tags")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    note: text("note"),
    eventId: uuid("event_id").notNull(),
    submittedAt: tstz("submitted_at").notNull(),
  },
  (t) => [
    check("checkins_mood_range", sql`${t.mood} between 1 and 5`),
    check("checkins_energy_range", sql`${t.energy} between 1 and 5`),
    check("checkins_focus_range", sql`${t.focus} between 1 and 5`),
  ],
).enableRLS();

/** Last time each source reported, for the data-health strip and gap alerts. */
export const sourceHealth = pgTable("source_health", {
  source: text("source").primaryKey(),
  lastEventAt: tstz("last_event_at").notNull(),
  lastError: text("last_error"),
  /** Latest heartbeat payload for the `device` source (permissions, pending count…). */
  details: jsonb("details"),
  updatedAt: tstz("updated_at").notNull().defaultNow(),
}).enableRLS();

/** Headline metrics per local day; what the dashboard and MCP server read first. */
export const dailySummary = pgTable("daily_summary", {
  date: date("date", { mode: "string" }).primaryKey(),
  screenTimeMin: integer("screen_time_min"),
  unlocks: integer("unlocks"),
  firstUnlockAt: tstz("first_unlock_at"),
  lastUnlockAt: tstz("last_unlock_at"),
  mood: smallint("mood"),
  energy: smallint("energy"),
  focus: smallint("focus"),
  updatedAt: tstz("updated_at").notNull().defaultNow(),
}).enableRLS();
