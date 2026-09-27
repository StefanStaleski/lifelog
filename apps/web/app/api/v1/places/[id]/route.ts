import { z } from "zod";
import { getDb } from "@/lib/db";
import { badRequest, guarded } from "@/lib/http";
import { PlacePatchSchema, updatePlace } from "@/lib/places";

export const dynamic = "force-dynamic";

/** Rename, move, resize or archive (`{"archived": true}`) a place. */
export function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return guarded(req, async () => {
    const { id } = await params;
    if (!z.uuid().safeParse(id).success) return badRequest("invalid id");
    const patch = PlacePatchSchema.safeParse(await req.json().catch(() => null));
    if (!patch.success) return badRequest(patch.error.issues[0]?.message ?? "invalid patch");
    const place = await updatePlace(getDb(), id, patch.data);
    return place ? Response.json(place) : Response.json({ error: "not found" }, { status: 404 });
  });
}
