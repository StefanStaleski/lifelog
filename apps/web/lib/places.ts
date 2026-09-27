import { PLACE_KINDS, places } from "@lifelog/shared/db";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "./db";

export const PlaceInputSchema = z.strictObject({
  name: z.string().trim().min(1).max(60),
  kind: z.enum(PLACE_KINDS),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  radius_m: z.int().min(50).max(2000),
});
export const PlacePatchSchema = PlaceInputSchema.partial().extend({
  archived: z.boolean().optional(),
});

export type PlaceDto = z.infer<typeof PlaceInputSchema> & { id: string; archived: boolean };

const toDto = (p: typeof places.$inferSelect): PlaceDto => ({
  id: p.id,
  name: p.name,
  kind: p.kind,
  lat: p.lat,
  lng: p.lng,
  radius_m: p.radiusM,
  archived: p.archivedAt !== null,
});

export async function listPlaces(db: Db): Promise<PlaceDto[]> {
  return (await db.select().from(places).orderBy(asc(places.createdAt))).map(toDto);
}

export async function createPlace(
  db: Db,
  input: z.infer<typeof PlaceInputSchema>,
): Promise<PlaceDto> {
  const [row] = await db
    .insert(places)
    .values({
      name: input.name,
      kind: input.kind,
      lat: input.lat,
      lng: input.lng,
      radiusM: input.radius_m,
    })
    .returning();
  return toDto(row!);
}

/** Archiving keeps past visits; the phone stops geofencing it on its next config refresh. */
export async function updatePlace(
  db: Db,
  id: string,
  patch: z.infer<typeof PlacePatchSchema>,
): Promise<PlaceDto | null> {
  const [row] = await db
    .update(places)
    .set({
      ...(patch.name !== undefined && { name: patch.name }),
      ...(patch.kind !== undefined && { kind: patch.kind }),
      ...(patch.lat !== undefined && { lat: patch.lat }),
      ...(patch.lng !== undefined && { lng: patch.lng }),
      ...(patch.radius_m !== undefined && { radiusM: patch.radius_m }),
      ...(patch.archived !== undefined && { archivedAt: patch.archived ? new Date() : null }),
    })
    .where(eq(places.id, id))
    .returning();
  return row ? toDto(row) : null;
}
