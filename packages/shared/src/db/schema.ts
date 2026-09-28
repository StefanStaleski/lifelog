import { sql } from "drizzle-orm";
import {
  customType,
  bigint,
  boolean,
  check,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  real,
  smallint,
  text,
  time,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { CALL_DIRECTIONS } from "../events";

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
  // Phase 5: work (from laptop + work-tagged phone apps), calls and messages
  /** worked_in_hours_min + worked_after_hours_min */
  workedMin: integer("worked_min"),
  /** Work inside the schedule in `work_settings`. */
  workedInHoursMin: integer("worked_in_hours_min"),
  workedAfterHoursMin: integer("worked_after_hours_min"),
  /** Start of the first 30-min window with work. */
  firstWorkAt: tstz("first_work_at"),
  /** End of the last 30-min window with work. */
  lastWorkAt: tstz("last_work_at"),
  /** Active (not AFK) laptop time, all apps. */
  desktopMin: integer("desktop_min"),
  /** Time at a home place inside the work schedule. */
  wfhMin: integer("wfh_min"),
  /** Connected calls (incoming or outgoing with a duration). */
  calls: integer("calls"),
  callMin: integer("call_min"),
  /** Distinct people across connected calls, SMS and messaging-app senders. */
  peopleContacted: integer("people_contacted"),
  /** Messaging-app messages received (from notifications). */
  messagesReceived: integer("messages_received"),
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

/** Context for each local day that doesn't come from the phone: weather (and later calendar load). */
export const contextDaily = pgTable("context_daily", {
  date: date("date", { mode: "string" }).primaryKey(),
  tempMax: real("temp_max"),
  tempMin: real("temp_min"),
  precipMm: real("precip_mm"),
  /** WMO weather code (Open-Meteo). */
  weatherCode: smallint("weather_code"),
  meetingCount: smallint("meeting_count"),
  meetingMinutes: integer("meeting_minutes"),
  updatedAt: tstz("updated_at").notNull().defaultNow(),
}).enableRLS();

/** Spots the owner said aren't a place ("Not a place" on a suggestion); rounded like stays. */
export const dismissedSuggestions = pgTable(
  "dismissed_suggestions",
  {
    lat: doublePrecision("lat").notNull(),
    lng: doublePrecision("lng").notNull(),
    createdAt: tstz("created_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.lat, t.lng] })],
).enableRLS();

const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => "bytea" });

/** The owner's portrait: 1 photo, or a turn-around set (frame 0..n-1) for the 360° view. Private. */
export const portraitFrames = pgTable(
  "portrait_frames",
  {
    idx: smallint("idx").primaryKey(),
    mime: text("mime").notNull(),
    bytes: bytea("bytes").notNull(),
    updatedAt: tstz("updated_at").notNull().defaultNow(),
  },
  (t) => [check("portrait_frames_idx", sql`${t.idx} between 0 and 35`)],
).enableRLS();

// ---------------------------------------------------------------------------------------------
// Phase 5: work, people, conversations

/**
 * Phone foreground time per app per 30-min UTC window (from app_usage events), kept so work
 * minutes can be rebuilt after raw events are pruned; `app_usage` only has daily totals.
 */
export const appUsageWindows = pgTable(
  "app_usage_windows",
  {
    windowStart: tstz("window_start").notNull(),
    package: text("package").notNull(),
    foregroundMs: integer("foreground_ms").notNull(),
  },
  (t) => [primaryKey({ columns: [t.windowStart, t.package] })],
).enableRLS();

/** Laptop activity per app (and browser hostname) per 30-min UTC window, from ActivityWatch. */
export const desktopUsage = pgTable(
  "desktop_usage",
  {
    windowStart: tstz("window_start").notNull(),
    app: text("app").notNull(),
    /** Browser hostname; '' (not null: it is part of the key) outside the browser. */
    host: text("host").notNull().default(""),
    activeMs: integer("active_ms").notNull(),
    deviceId: text("device_id").notNull(),
  },
  (t) => [primaryKey({ columns: [t.windowStart, t.app, t.host] })],
).enableRLS();

/** Phone calls from the call log (id = the call event id). */
export const calls = pgTable(
  "calls",
  {
    id: uuid("id").primaryKey(),
    occurredAt: tstz("occurred_at").notNull(),
    direction: text("direction", { enum: CALL_DIRECTIONS }).notNull(),
    durationS: integer("duration_s").notNull(),
    contactHash: text("contact_hash").notNull(),
    contactName: text("contact_name"),
  },
  (t) => [
    index("calls_occurred_at_idx").on(t.occurredAt),
    index("calls_contact_hash_idx").on(t.contactHash),
    check("calls_direction", sql`${t.direction} in ('incoming', 'outgoing', 'missed', 'rejected')`),
  ],
).enableRLS();

/** SMS sent and received (id = the sms event id). Never the text. */
export const smsMessages = pgTable(
  "sms_messages",
  {
    id: uuid("id").primaryKey(),
    occurredAt: tstz("occurred_at").notNull(),
    direction: text("direction", { enum: ["in", "out"] }).notNull(),
    contactHash: text("contact_hash").notNull(),
    contactName: text("contact_name"),
  },
  (t) => [
    index("sms_messages_occurred_at_idx").on(t.occurredAt),
    index("sms_messages_contact_hash_idx").on(t.contactHash),
    check("sms_messages_direction", sql`${t.direction} in ('in', 'out')`),
  ],
).enableRLS();

/** Messaging-app messages received per sender per hour (counted from notifications). */
export const messageCounts = pgTable(
  "message_counts",
  {
    hour: tstz("hour").notNull(),
    package: text("package").notNull(),
    appLabel: text("app_label").notNull(),
    senderHash: text("sender_hash").notNull(),
    senderName: text("sender_name").notNull(),
    /** Group name, null for a direct message. */
    conversation: text("conversation"),
    count: integer("count").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.hour, t.package, t.senderHash] }),
    index("message_counts_sender_hash_idx").on(t.senderHash),
  ],
).enableRLS();

export const PERSON_KINDS = ["phone", "messaging"] as const;

/**
 * Everyone seen in calls and SMS (key = contact_hash) or messaging apps (key = sender_hash).
 * Upserted by the ingest; the owner can rename (label) and hide.
 */
export const people = pgTable(
  "people",
  {
    contactHash: text("contact_hash").primaryKey(),
    /** phone: hash of a number (calls, SMS); messaging: sender_hash (app + sender name). */
    kind: text("kind", { enum: PERSON_KINDS }).notNull(),
    /** Latest non-null name from the phone's contacts or the messaging app. */
    displayName: text("display_name"),
    /** The owner's own name for this person, shown instead of display_name. */
    label: text("label"),
    /** Hidden people (e.g. a bank's sender) are left out of people_contacted. */
    hidden: boolean("hidden").notNull().default(false),
    firstSeenAt: tstz("first_seen_at").notNull(),
    lastSeenAt: tstz("last_seen_at").notNull(),
  },
  (t) => [check("people_kind", sql`${t.kind} in ('phone', 'messaging')`)],
).enableRLS();

/** The work schedule (single row, id = 1). Local times in Europe/Skopje. */
export const workSettings = pgTable(
  "work_settings",
  {
    id: smallint("id").primaryKey().default(1),
    /** ISO weekdays, 1 = Monday … 7 = Sunday. */
    days: integer("days")
      .array()
      .notNull()
      .default(sql`'{1,2,3,4,5}'::integer[]`),
    startLocal: time("start_local").notNull().default("09:00"),
    endLocal: time("end_local").notNull().default("17:00"),
    /** Laptop activity nobody tagged counts as work inside the schedule. */
    untaggedDesktopIsWork: boolean("untagged_desktop_is_work").notNull().default(true),
    updatedAt: tstz("updated_at").notNull().defaultNow(),
  },
  (t) => [
    check("work_settings_single_row", sql`${t.id} = 1`),
    check("work_settings_days", sql`${t.days} <@ '{1,2,3,4,5,6,7}'::integer[]`),
    check("work_settings_hours", sql`${t.startLocal} < ${t.endLocal}`),
  ],
).enableRLS();

export const APP_TAG_SOURCES = ["phone", "desktop", "host"] as const;

/** Work / not-work tags: phone packages, desktop app names and browser hostnames. */
export const appTags = pgTable(
  "app_tags",
  {
    source: text("source", { enum: APP_TAG_SOURCES }).notNull(),
    /** Package name (phone), ActivityWatch app name (desktop) or hostname (host). */
    key: text("key").notNull(),
    isWork: boolean("is_work").notNull(),
    updatedAt: tstz("updated_at").notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.source, t.key] }),
    check("app_tags_source", sql`${t.source} in ('phone', 'desktop', 'host')`),
  ],
).enableRLS();

/**
 * Server-side secrets (single row, id = 1). `contact_salt` keys the phone's contact and sender
 * hashes: created once by the migration and never changed (a new salt would split every person).
 */
export const serverSecrets = pgTable(
  "server_secrets",
  {
    id: smallint("id").primaryKey().default(1),
    contactSalt: text("contact_salt")
      .notNull()
      .default(sql`encode(extensions.gen_random_bytes(32), 'hex')`),
    createdAt: tstz("created_at").notNull().defaultNow(),
  },
  (t) => [check("server_secrets_single_row", sql`${t.id} = 1`)],
).enableRLS();
