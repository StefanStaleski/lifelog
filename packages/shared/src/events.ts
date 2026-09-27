import { z } from "zod";

/**
 * Wire contract for events sent by the phone to `POST /api/v1/events/batch`.
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
  }),
});

export const EventSchema = z.discriminatedUnion("type", [
  AppUsageEventSchema,
  UnlockEventSchema,
  CheckinEventSchema,
  HeartbeatEventSchema,
]);

export type Event = z.infer<typeof EventSchema>;
export type EventType = Event["type"];
export type AppUsageEvent = z.infer<typeof AppUsageEventSchema>;
export type UnlockEvent = z.infer<typeof UnlockEventSchema>;
export type CheckinEvent = z.infer<typeof CheckinEventSchema>;
export type HeartbeatEvent = z.infer<typeof HeartbeatEventSchema>;

export const EVENT_TYPES = EventSchema.options.map((o) => o.shape.type.value) as EventType[];

/**
 * Batch body. Events stay `unknown` here so the ingest can validate each one with
 * {@link EventSchema} and reject bad events individually instead of failing the whole batch.
 */
export const EventBatchSchema = z.strictObject({
  events: z.array(z.unknown()).min(1).max(MAX_BATCH_SIZE),
});

export type EventBatch = z.infer<typeof EventBatchSchema>;
