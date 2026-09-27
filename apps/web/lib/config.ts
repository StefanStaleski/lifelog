import { type ConfigResponse, LOCAL_TIME_ZONE, MAX_BATCH_SIZE } from "@lifelog/shared";
import { places } from "@lifelog/shared/db";
import { asc, isNull } from "drizzle-orm";
import type { Db } from "./db";

/** Phone-side settings served by `GET /api/v1/config`, including the places to geofence. */
export async function getConfig(db: Db): Promise<ConfigResponse> {
  const active = await db
    .select()
    .from(places)
    .where(isNull(places.archivedAt))
    .orderBy(asc(places.createdAt));
  return {
    time_zone: LOCAL_TIME_ZONE,
    collection_interval_min: 30,
    upload_batch_size: MAX_BATCH_SIZE,
    checkin_time: "21:30",
    places: active.map((p) => ({
      id: p.id,
      name: p.name,
      kind: p.kind,
      lat: p.lat,
      lng: p.lng,
      radius_m: p.radiusM,
    })),
  };
}
