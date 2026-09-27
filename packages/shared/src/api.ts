import { z } from "zod";
import { LOCAL_TIME_ZONE } from "./time";

/**
 * Response bodies of /api/v1 routes the phone reads. Kotlin models must match;
 * examples live in `fixtures/api`.
 */

const utcInstant = z.iso.datetime({ offset: false, local: false });

/** `POST /api/v1/events/batch` */
export const IngestResponseSchema = z.strictObject({
  accepted: z.int().nonnegative(),
  duplicates: z.int().nonnegative(),
  rejected: z.array(
    z.strictObject({
      index: z.int().nonnegative(),
      id: z.string().nullable(),
      error: z.string(),
    }),
  ),
});
export type IngestResponse = z.infer<typeof IngestResponseSchema>;

/** A named place the phone geofences (defined in the dashboard from Phase 2). */
export const PlaceSchema = z.strictObject({
  id: z.uuid(),
  name: z.string(),
  kind: z.enum(["home", "work", "gym", "other"]),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  radius_m: z.int().positive(),
});
export type Place = z.infer<typeof PlaceSchema>;

/** `GET /api/v1/config` */
export const ConfigResponseSchema = z.strictObject({
  time_zone: z.literal(LOCAL_TIME_ZONE),
  collection_interval_min: z.int().positive(),
  upload_batch_size: z.int().positive(),
  /** Local time of the daily check-in reminder, HH:mm. */
  checkin_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  places: z.array(PlaceSchema),
});
export type ConfigResponse = z.infer<typeof ConfigResponseSchema>;

/**
 * How long each source may stay silent before it counts as stale. The heartbeat is the real
 * liveness signal: app_usage and unlocks legitimately pause overnight.
 */
export const STALE_AFTER_MIN: Record<string, number> = {
  heartbeat: 120,
  unlock: 24 * 60,
  app_usage: 24 * 60,
  screen: 24 * 60,
  steps: 24 * 60,
  activity: 24 * 60,
  checkin: 48 * 60,
  // geofence / stay: no allowance, a day at home without leaving is normal
};

/** `GET /api/v1/health` */
export const HealthResponseSchema = z.strictObject({
  generated_at: utcInstant,
  sources: z.array(
    z.strictObject({
      source: z.string(),
      last_event_at: utcInstant,
      last_error: z.string().nullable(),
      /** null for sources without a staleness rule (e.g. `ingest`). */
      stale_after_min: z.int().positive().nullable(),
      stale: z.boolean(),
      details: z.record(z.string(), z.unknown()).nullable(),
    }),
  ),
});
export type HealthResponse = z.infer<typeof HealthResponseSchema>;

/** `GET /api/v1/gate?days=7`: is collection complete enough to pass the phase gate? */
export const GateResponseSchema = z.strictObject({
  from: utcInstant,
  to: utcInstant,
  days: z.int().positive(),
  /** First heartbeat ever received; null before the phone has reported. */
  tracking_since: utcInstant.nullable(),
  max_gap_min: z.int().positive(),
  gaps: z.array(z.strictObject({ from: utcInstant, to: utcInstant, minutes: z.int() })),
  per_day: z.array(
    z.strictObject({
      date: z.iso.date(),
      heartbeats: z.int().nonnegative(),
      screen_time_min: z.int().nullable(),
      unlocks: z.int().nullable(),
      checkin: z.boolean(),
    }),
  ),
  passed: z.boolean(),
  /** One friendly sentence, e.g. "Day 3 of 7, no gaps so far." */
  summary: z.string(),
});
export type GateResponse = z.infer<typeof GateResponseSchema>;
