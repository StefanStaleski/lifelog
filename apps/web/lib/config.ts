import { type ConfigResponse, LOCAL_TIME_ZONE, MAX_BATCH_SIZE } from "@lifelog/shared";

/** Phone-side settings served by `GET /api/v1/config`. Places come from the DB in Phase 2. */
export function getConfig(): ConfigResponse {
  return {
    time_zone: LOCAL_TIME_ZONE,
    collection_interval_min: 30,
    upload_batch_size: MAX_BATCH_SIZE,
    checkin_time: "21:30",
    places: [],
  };
}
