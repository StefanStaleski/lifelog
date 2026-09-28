import { z } from "zod";

/**
 * Wire contract for events sent by the phone (and the laptop's desktop collector) to
 * `POST /api/v1/events/batch`.
 * Kotlin models in apps/android must match; both sides test against `fixtures/events`.
 */

export const MAX_BATCH_SIZE = 500;

/** device_id used by scripts/smoke.sh; its events are ignored by the gate and stats. */
export const SMOKE_TEST_DEVICE_ID = "smoke-test";

/** ISO-8601 UTC instant with a `Z` suffix; offsets are rejected. */
const utcInstant = z.iso.datetime({ offset: false, local: false });

const envelope = {
  /** UUID generated on the device; the ingest dedupes on it. */
  id: z.uuid(),
  occurred_at: utcInstant,
  device_id: z.string().min(1).max(64),
};

/** Foreground time for one app within one collection window [occurred_at, ended_at). */
export const AppUsageEventSchema = z
  .strictObject({
    ...envelope,
    type: z.literal("app_usage"),
    ended_at: utcInstant,
    payload: z.strictObject({
      package: z.string().min(1).max(255),
      app_label: z.string().min(1).max(255),
      /** ApplicationInfo.category name (e.g. "social"), null when undefined. */
      category: z.string().max(64).nullable(),
      foreground_ms: z.int().nonnegative(),
      launches: z.int().nonnegative(),
    }),
  })
  .check((ctx) => {
    const windowMs = Date.parse(ctx.value.ended_at) - Date.parse(ctx.value.occurred_at);
    if (windowMs <= 0) {
      ctx.issues.push({
        code: "custom",
        message: "ended_at must be after occurred_at",
        path: ["ended_at"],
        input: ctx.value.ended_at,
      });
    } else if (ctx.value.payload.foreground_ms > windowMs) {
      ctx.issues.push({
        code: "custom",
        message: "foreground_ms exceeds the collection window",
        path: ["payload", "foreground_ms"],
        input: ctx.value.payload.foreground_ms,
      });
    }
  });

/** One device unlock (keyguard dismissed) at occurred_at. */
export const UnlockEventSchema = z.strictObject({
  ...envelope,
  type: z.literal("unlock"),
  payload: z.strictObject({}),
});

const score = z.int().min(1).max(5);

/** Evening check-in; the latest one per `date` wins. */
export const CheckinEventSchema = z.strictObject({
  ...envelope,
  type: z.literal("checkin"),
  payload: z.strictObject({
    /** Local date (Europe/Skopje) the check-in is about; may differ from occurred_at after midnight. */
    date: z.iso.date(),
    mood: score,
    energy: score,
    focus: score,
    tags: z.array(z.string().trim().min(1).max(40)).max(20),
    note: z.string().max(2000).nullable(),
  }),
});

/** Collector self-report, sent every collection run; feeds `source_health` and the gap check. */
export const HeartbeatEventSchema = z.strictObject({
  ...envelope,
  type: z.literal("heartbeat"),
  payload: z.strictObject({
    app_version: z.string().min(1).max(32),
    pending_count: z.int().nonnegative(),
    collection_paused: z.boolean(),
    usage_access_granted: z.boolean(),
    battery_optimization_ignored: z.boolean(),
    // Phase 2+ (optional so older app builds keep working)
    charging: z.boolean().optional(),
    battery_pct: z.int().min(0).max(100).optional(),
    health_connect_granted: z.boolean().optional(),
    activity_recognition_granted: z.boolean().optional(),
    location_granted: z.boolean().optional(),
    background_location_granted: z.boolean().optional(),
    notification_listener_granted: z.boolean().optional(),
    /** Exempt from Android's "remove permissions if app is unused". */
    auto_revoke_exempt: z.boolean().optional(),
  }),
});

/** Steps and distance for one finished hour [occurred_at, ended_at) from Health Connect. */
export const StepsEventSchema = z
  .strictObject({
    ...envelope,
    type: z.literal("steps"),
    ended_at: utcInstant,
    payload: z.strictObject({
      steps: z.int().nonnegative().max(100_000),
      distance_m: z.int().nonnegative().max(200_000),
    }),
  })
  .check((ctx) => {
    const start = Date.parse(ctx.value.occurred_at);
    if (start % 3_600_000 !== 0 || Date.parse(ctx.value.ended_at) - start !== 3_600_000) {
      ctx.issues.push({
        code: "custom",
        message: "steps must cover exactly one whole UTC hour",
        path: ["ended_at"],
        input: ctx.value.ended_at,
      });
    }
  });

export const ACTIVITY_KINDS = ["still", "walking", "running", "on_bicycle", "in_vehicle"] as const;

/** Activity Recognition transition: entering or leaving an activity at occurred_at. */
export const ActivityEventSchema = z.strictObject({
  ...envelope,
  type: z.literal("activity"),
  payload: z.strictObject({
    activity: z.enum(ACTIVITY_KINDS),
    transition: z.enum(["enter", "exit"]),
  }),
});

/** Screen turned on or off (from UsageStats), used for the sleep estimate. */
export const ScreenEventSchema = z.strictObject({
  ...envelope,
  type: z.literal("screen"),
  payload: z.strictObject({ state: z.enum(["on", "off"]) }),
});

/** Arriving at or leaving a named place (geofence defined in the dashboard). */
export const GeofenceEventSchema = z.strictObject({
  ...envelope,
  type: z.literal("geofence"),
  payload: z.strictObject({
    place_id: z.uuid(),
    transition: z.enum(["enter", "exit"]),
  }),
});

/** Coordinates rounded to 3 decimals (~100 m): enough for "where", not a trace. */
const roundedCoord = (max: number) =>
  z
    .number()
    .min(-max)
    .max(max)
    .refine((v) => Math.abs(Math.round(v * 1000) - v * 1000) < 1e-6, "round to 3 decimals");

/** A stay of 15+ min outside known places, [occurred_at = arrived, ended_at = left]. */
export const StayEventSchema = z
  .strictObject({
    ...envelope,
    type: z.literal("stay"),
    ended_at: utcInstant,
    payload: z.strictObject({ lat: roundedCoord(90), lng: roundedCoord(180) }),
  })
  .check((ctx) => {
    if (Date.parse(ctx.value.ended_at) - Date.parse(ctx.value.occurred_at) < 15 * 60_000) {
      ctx.issues.push({
        code: "custom",
        message: "a stay lasts at least 15 minutes",
        path: ["ended_at"],
        input: ctx.value.ended_at,
      });
    }
  });

/** How many notifications one app posted in one finished UTC hour. Never any content. */
export const NotificationsEventSchema = z
  .strictObject({
    ...envelope,
    type: z.literal("notifications"),
    ended_at: utcInstant,
    payload: z.strictObject({
      package: z.string().min(1).max(255),
      app_label: z.string().min(1).max(255),
      count: z.int().positive().max(10_000),
    }),
  })
  .check((ctx) => {
    const start = Date.parse(ctx.value.occurred_at);
    if (start % 3_600_000 !== 0 || Date.parse(ctx.value.ended_at) - start !== 3_600_000) {
      ctx.issues.push({
        code: "custom",
        message: "notifications must cover exactly one whole UTC hour",
        path: ["ended_at"],
        input: ctx.value.ended_at,
      });
    }
  });

/**
 * Hex HMAC-SHA256 keyed with `contact_salt` from `GET /api/v1/config`: of the E.164 number
 * (default region MK) for `contact_hash`, of `package + "|" + sender_name` for `sender_hash`.
 */
const hmacHex = z.string().regex(/^[0-9a-f]{64}$/, "lowercase hex HMAC-SHA256");

/** A display name from the phone's contacts or a messaging notification; never message text. */
const personName = z.string().trim().min(1).max(255);

/** Bare hostname: lowercase, no scheme, port, path or query. */
const hostname = z
  .string()
  .max(253)
  .regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/, "bare hostname");

/**
 * Laptop (ActivityWatch): how long one app was focused and not AFK within one complete 30-min
 * UTC window. Browsers report one row per hostname; never window titles, URLs or paths.
 */
export const DesktopUsageEventSchema = z
  .strictObject({
    ...envelope,
    type: z.literal("desktop_usage"),
    ended_at: utcInstant,
    payload: z.strictObject({
      /** Application name as ActivityWatch reports it, e.g. "code", "firefox". */
      app: z.string().min(1).max(255),
      /** Browser tab hostname, null outside the browser. */
      host: hostname.nullable(),
      active_ms: z.int().nonnegative().max(1_800_000),
    }),
  })
  .check((ctx) => {
    const start = Date.parse(ctx.value.occurred_at);
    if (start % 1_800_000 !== 0 || Date.parse(ctx.value.ended_at) - start !== 1_800_000) {
      ctx.issues.push({
        code: "custom",
        message: "desktop_usage must cover exactly one whole 30-minute UTC window",
        path: ["ended_at"],
        input: ctx.value.ended_at,
      });
    }
  });

/** Laptop sync service self-report, sent every run; feeds `source_health` source `desktop`. */
export const DesktopHeartbeatEventSchema = z.strictObject({
  ...envelope,
  type: z.literal("desktop_heartbeat"),
  payload: z.strictObject({
    client_version: z.string().min(1).max(32),
    /** ActivityWatch server version, null when it could not be reached. */
    aw_version: z.string().min(1).max(32).nullable(),
    aw_reachable: z.boolean(),
    pending_count: z.int().nonnegative(),
  }),
});

export const CALL_DIRECTIONS = ["incoming", "outgoing", "missed", "rejected"] as const;

/** One phone call from the call log: occurred_at = start, ended_at = start + duration_s. */
export const CallEventSchema = z
  .strictObject({
    ...envelope,
    type: z.literal("call"),
    ended_at: utcInstant,
    payload: z.strictObject({
      direction: z.enum(CALL_DIRECTIONS),
      duration_s: z.int().nonnegative().max(86_400),
      contact_hash: hmacHex,
      /** Name from the phone's contacts; null for unknown numbers. */
      contact_name: personName.nullable(),
    }),
  })
  .check((ctx) => {
    const ms = Date.parse(ctx.value.ended_at) - Date.parse(ctx.value.occurred_at);
    if (ms !== ctx.value.payload.duration_s * 1000) {
      ctx.issues.push({
        code: "custom",
        message: "ended_at must be occurred_at + duration_s",
        path: ["ended_at"],
        input: ctx.value.ended_at,
      });
    }
  });

/** One SMS sent or received at occurred_at. Never the text. */
export const SmsEventSchema = z.strictObject({
  ...envelope,
  type: z.literal("sms"),
  payload: z.strictObject({
    direction: z.enum(["in", "out"]),
    contact_hash: hmacHex,
    /** Name from the phone's contacts; null for unknown numbers. */
    contact_name: personName.nullable(),
  }),
});

/**
 * Messages received from one sender in one messaging app in one finished UTC hour, counted from
 * notifications (sender and group name only, never the text). A re-sent hour may have grown.
 */
export const MessagesEventSchema = z
  .strictObject({
    ...envelope,
    type: z.literal("messages"),
    ended_at: utcInstant,
    payload: z.strictObject({
      package: z.string().min(1).max(255),
      app_label: z.string().min(1).max(255),
      sender_hash: hmacHex,
      sender_name: personName,
      /** Group conversation name, null for a direct message. */
      conversation: z.string().trim().min(1).max(255).nullable(),
      count: z.int().positive().max(10_000),
    }),
  })
  .check((ctx) => {
    const start = Date.parse(ctx.value.occurred_at);
    if (start % 3_600_000 !== 0 || Date.parse(ctx.value.ended_at) - start !== 3_600_000) {
      ctx.issues.push({
        code: "custom",
        message: "messages must cover exactly one whole UTC hour",
        path: ["ended_at"],
        input: ctx.value.ended_at,
      });
    }
  });

export const EventSchema = z.discriminatedUnion("type", [
  AppUsageEventSchema,
  UnlockEventSchema,
  CheckinEventSchema,
  HeartbeatEventSchema,
  StepsEventSchema,
  ActivityEventSchema,
  ScreenEventSchema,
  GeofenceEventSchema,
  StayEventSchema,
  NotificationsEventSchema,
  DesktopUsageEventSchema,
  DesktopHeartbeatEventSchema,
  CallEventSchema,
  SmsEventSchema,
  MessagesEventSchema,
]);

export type Event = z.infer<typeof EventSchema>;
export type EventType = Event["type"];
export type AppUsageEvent = z.infer<typeof AppUsageEventSchema>;
export type UnlockEvent = z.infer<typeof UnlockEventSchema>;
export type CheckinEvent = z.infer<typeof CheckinEventSchema>;
export type HeartbeatEvent = z.infer<typeof HeartbeatEventSchema>;
export type StepsEvent = z.infer<typeof StepsEventSchema>;
export type ActivityEvent = z.infer<typeof ActivityEventSchema>;
export type ScreenEvent = z.infer<typeof ScreenEventSchema>;
export type GeofenceEvent = z.infer<typeof GeofenceEventSchema>;
export type StayEvent = z.infer<typeof StayEventSchema>;
export type NotificationsEvent = z.infer<typeof NotificationsEventSchema>;
export type DesktopUsageEvent = z.infer<typeof DesktopUsageEventSchema>;
export type DesktopHeartbeatEvent = z.infer<typeof DesktopHeartbeatEventSchema>;
export type CallEvent = z.infer<typeof CallEventSchema>;
export type SmsEvent = z.infer<typeof SmsEventSchema>;
export type MessagesEvent = z.infer<typeof MessagesEventSchema>;

export const EVENT_TYPES = EventSchema.options.map((o) => o.shape.type.value) as EventType[];

/** The only event types a request authorised with the laptop's `DESKTOP_TOKEN` may send. */
export const DESKTOP_EVENT_TYPES = [
  "desktop_usage",
  "desktop_heartbeat",
] as const satisfies readonly EventType[];

/**
 * Batch body. Events stay `unknown` here so the ingest can validate each one with
 * {@link EventSchema} and reject bad events individually instead of failing the whole batch.
 */
export const EventBatchSchema = z.strictObject({
  events: z.array(z.unknown()).min(1).max(MAX_BATCH_SIZE),
});

export type EventBatch = z.infer<typeof EventBatchSchema>;
