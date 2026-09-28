import { z } from "zod";

/*
 * Wire contract for the laptop's events, exactly as docs/PLAN-PHASE-5.md ("Wire contract") defines
 * `desktop_usage` and `desktop_heartbeat`.
 *
 * TODO(5.1): once the shared contract is merged, delete everything below the imports and re-export
 * the shared schemas instead:
 *
 *   export {
 *     DesktopUsageEventSchema,
 *     DesktopHeartbeatEventSchema,
 *     MAX_BATCH_SIZE,
 *     IngestResponseSchema,
 *     type DesktopUsageEvent,
 *     type DesktopHeartbeatEvent,
 *     type IngestResponse,
 *   } from "@lifelog/shared";
 *
 * (and add `"@lifelog/shared": "workspace:^"` to package.json). The rest of the app only imports
 * these names from this module.
 */

export const MAX_BATCH_SIZE = 500;

/** One collection window: complete 30-minute UTC windows only. */
export const WINDOW_MS = 30 * 60_000;

const utcInstant = z.iso.datetime({ offset: false, local: false });

const envelope = {
  id: z.uuid(),
  occurred_at: utcInstant,
  device_id: z.string().min(1).max(64),
};

/** Focused, not-AFK time for one app (and browser hostname) in one 30-min UTC window. */
export const DesktopUsageEventSchema = z
  .strictObject({
    ...envelope,
    type: z.literal("desktop_usage"),
    ended_at: utcInstant,
    payload: z.strictObject({
      /** Normalised app / window class, lowercase (e.g. "code", "firefox"). */
      app: z.string().min(1).max(255),
      /** Browser hostname from aw-watcher-web, null for everything else. Never a URL. */
      host: z.string().min(1).max(253).nullable(),
      active_ms: z.int().nonnegative(),
    }),
  })
  .check((ctx) => {
    const start = Date.parse(ctx.value.occurred_at);
    if (start % WINDOW_MS !== 0 || Date.parse(ctx.value.ended_at) - start !== WINDOW_MS) {
      ctx.issues.push({
        code: "custom",
        message: "desktop_usage must cover exactly one 30-minute UTC window",
        path: ["ended_at"],
        input: ctx.value.ended_at,
      });
    } else if (ctx.value.payload.active_ms > WINDOW_MS) {
      ctx.issues.push({
        code: "custom",
        message: "active_ms exceeds the window",
        path: ["payload", "active_ms"],
        input: ctx.value.payload.active_ms,
      });
    }
  });

/** Collector self-report, sent every sync run. */
export const DesktopHeartbeatEventSchema = z.strictObject({
  ...envelope,
  type: z.literal("desktop_heartbeat"),
  payload: z.strictObject({
    client_version: z.string().min(1).max(32),
    /** null when ActivityWatch did not answer. */
    aw_version: z.string().min(1).max(32).nullable(),
    aw_reachable: z.boolean(),
    pending_count: z.int().nonnegative(),
  }),
});

export const DesktopEventSchema = z.discriminatedUnion("type", [
  DesktopUsageEventSchema,
  DesktopHeartbeatEventSchema,
]);

export type DesktopUsageEvent = z.infer<typeof DesktopUsageEventSchema>;
export type DesktopHeartbeatEvent = z.infer<typeof DesktopHeartbeatEventSchema>;
export type DesktopEvent = z.infer<typeof DesktopEventSchema>;

/** `POST /api/v1/events/batch` response (same as packages/shared/src/api.ts). */
export const IngestResponseSchema = z.object({
  accepted: z.int().nonnegative(),
  duplicates: z.int().nonnegative(),
  rejected: z.array(
    z.object({ index: z.int().nonnegative(), id: z.string().nullable(), error: z.string() }),
  ),
});
export type IngestResponse = z.infer<typeof IngestResponseSchema>;
