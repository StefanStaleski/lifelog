import type { DesktopHeartbeatEvent, DesktopUsageEvent } from "@lifelog/shared";

/* The laptop's slice of the wire contract in @lifelog/shared (packages/shared/src/events.ts). */

export {
  DesktopHeartbeatEventSchema,
  DesktopUsageEventSchema,
  IngestResponseSchema,
  MAX_BATCH_SIZE,
  type DesktopHeartbeatEvent,
  type DesktopUsageEvent,
  type IngestResponse,
} from "@lifelog/shared";

/** One collection window: complete 30-minute UTC windows only. */
export const WINDOW_MS = 30 * 60_000;

export type DesktopEvent = DesktopUsageEvent | DesktopHeartbeatEvent;
