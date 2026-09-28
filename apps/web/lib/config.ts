import { type ConfigResponse, LOCAL_TIME_ZONE, MAX_BATCH_SIZE } from "@lifelog/shared";
import { places, serverSecrets } from "@lifelog/shared/db";
import { asc, eq, isNull } from "drizzle-orm";
import type { Db } from "./db";

/** Phone-side settings served by `GET /api/v1/config`, including the places to geofence. */
export async function getConfig(db: Db): Promise<ConfigResponse> {
  const [active, [secrets]] = await Promise.all([
    db.select().from(places).where(isNull(places.archivedAt)).orderBy(asc(places.createdAt)),
    db
      .select({ contactSalt: serverSecrets.contactSalt })
      .from(serverSecrets)
      .where(eq(serverSecrets.id, 1)),
  ]);
  // Created once by the phase 5 migration. Never re-create it here: a new salt would give
  // everyone new hashes, so a missing row is an error, not something to paper over.
  if (!secrets) throw new Error("server_secrets row is missing (contact_salt)");
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
    contact_salt: secrets.contactSalt,
  };
}
