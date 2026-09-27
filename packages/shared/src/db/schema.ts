import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  real,
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
  steps: integer("steps"),
  distanceM: integer("distance_m"),
  sleepMin: integer("sleep_min"),
  sleepConfidence: real("sleep_confidence"),
  homeMin: integer("home_min"),
  workMin: integer("work_min"),
  gymMin: integer("gym_min"),
  otherPlacesMin: integer("other_places_min"),
  notifications: integer("notifications"),
  spendMkd: integer("spend_mkd"),
  updatedAt: tstz("updated_at").notNull().defaultNow(),
}).enableRLS();

export const PLACE_KINDS = ["home", "work", "gym", "other"] as const;

/** Named places, defined in the dashboard and geofenced by the phone. */
export const places = pgTable(
  "places",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    kind: text("kind", { enum: PLACE_KINDS }).notNull(),
    lat: doublePrecision("lat").notNull(),
    lng: doublePrecision("lng").notNull(),
    radiusM: integer("radius_m").notNull(),
    createdAt: tstz("created_at").notNull().defaultNow(),
    /** Archived places stop being geofenced but keep their visits. */
    archivedAt: tstz("archived_at"),
  },
  (t) => [
    check("places_kind", sql`${t.kind} in ('home', 'work', 'gym', 'other')`),
    check("places_radius", sql`${t.radiusM} between 50 and 2000`),
  ],
).enableRLS();

/** Time spent at a named place; left_at is null while still there. */
export const visits = pgTable(
  "visits",
  {
    placeId: uuid("place_id").notNull(),
    arrivedAt: tstz("arrived_at").notNull(),
    leftAt: tstz("left_at"),
  },
  (t) => [primaryKey({ columns: [t.placeId, t.arrivedAt] })],
).enableRLS();

/** Stays of 15+ minutes outside named places (coordinates rounded to ~100 m). */
export const locationStays = pgTable(
  "location_stays",
  {
    eventId: uuid("event_id").primaryKey(),
    arrivedAt: tstz("arrived_at").notNull(),
    leftAt: tstz("left_at").notNull(),
    lat: doublePrecision("lat").notNull(),
    lng: doublePrecision("lng").notNull(),
  },
  (t) => [index("location_stays_arrived_at_idx").on(t.arrivedAt)],
).enableRLS();

export const stepsHourly = pgTable("steps_hourly", {
  hour: tstz("hour").primaryKey(),
  steps: integer("steps").notNull(),
  distanceM: integer("distance_m").notNull(),
}).enableRLS();

/** Continuous stretches of one activity, rebuilt from Activity Recognition transitions. */
export const activitySegments = pgTable("activity_segments", {
  startedAt: tstz("started_at").primaryKey(),
  endedAt: tstz("ended_at"),
  kind: text("kind").notNull(),
}).enableRLS();

export const screenEvents = pgTable(
  "screen_events",
  {
    eventId: uuid("event_id").primaryKey(),
    occurredAt: tstz("occurred_at").notNull(),
    state: text("state").notNull(),
  },
  (t) => [index("screen_events_occurred_at_idx").on(t.occurredAt)],
).enableRLS();

/** Night of sleep ending on `date` (local wake-up date). */
export const sleepEstimates = pgTable("sleep_estimates", {
  date: date("date", { mode: "string" }).primaryKey(),
  sleepStart: tstz("sleep_start").notNull(),
  wakeAt: tstz("wake_at").notNull(),
  durationMin: integer("duration_min").notNull(),
  /** 0–1 */
  confidence: real("confidence").notNull(),
  /** Set when the owner corrected the estimate (never overwritten by the job). */
  corrected: boolean("corrected").notNull().default(false),
  computedAt: tstz("computed_at").notNull().defaultNow(),
}).enableRLS();

/** Notifications posted per app per hour (counts only, never content). */
export const notificationsHourly = pgTable(
  "notifications_hourly",
  {
    hour: tstz("hour").notNull(),
    package: text("package").notNull(),
    appLabel: text("app_label").notNull(),
    count: integer("count").notNull(),
  },
  (t) => [primaryKey({ columns: [t.hour, t.package] })],
).enableRLS();

/** Per-bank message formats, served to the phone in /v1/config (see packages/shared/src/bank.ts). */
export const bankParsers = pgTable(
  "bank_parsers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    source: text("source", { enum: ["notification", "sms"] }).notNull(),
    match: text("match").notNull(),
    pattern: text("pattern").notNull(),
    currency: text("currency").notNull(),
    decimal: text("decimal", { enum: [",", "."] }).notNull(),
    direction: text("direction", { enum: ["debit", "credit"] })
      .notNull()
      .default("debit"),
    active: boolean("active").notNull().default(true),
    createdAt: tstz("created_at").notNull().defaultNow(),
  },
  (t) => [
    check("bank_parsers_source", sql`${t.source} in ('notification', 'sms')`),
    check("bank_parsers_decimal", sql`${t.decimal} in (',', '.')`),
    check("bank_parsers_direction", sql`${t.direction} in ('debit', 'credit')`),
  ],
).enableRLS();

export const transactions = pgTable(
  "transactions",
  {
    eventId: uuid("event_id").primaryKey(),
    occurredAt: tstz("occurred_at").notNull(),
    amount: numeric("amount", { precision: 14, scale: 2, mode: "number" }).notNull(),
    currency: text("currency").notNull(),
    direction: text("direction").notNull(),
    merchant: text("merchant"),
    category: text("category").notNull(),
    /** sha256 of the original message; the message itself is never stored. */
    rawHash: text("raw_hash").notNull().unique(),
  },
  (t) => [index("transactions_occurred_at_idx").on(t.occurredAt)],
).enableRLS();

/** Merchant name patterns (case-insensitive regex) → spending category. First match by priority wins. */
export const spendingRules = pgTable("spending_rules", {
  id: uuid("id").primaryKey().defaultRandom(),
  pattern: text("pattern").notNull(),
  category: text("category").notNull(),
  priority: integer("priority").notNull().default(100),
}).enableRLS();
