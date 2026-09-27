import { getDb } from "@/lib/db";
import { badRequest, guarded } from "@/lib/http";
import { createPlace, listPlaces, PlaceInputSchema } from "@/lib/places";

export const dynamic = "force-dynamic";

export function GET(req: Request) {
  return guarded(req, async () => Response.json({ places: await listPlaces(getDb()) }));
}

export function POST(req: Request) {
  return guarded(req, async () => {
    const input = PlaceInputSchema.safeParse(await req.json().catch(() => null));
    if (!input.success) return badRequest(input.error.issues[0]?.message ?? "invalid place");
    return Response.json(await createPlace(getDb(), input.data), { status: 201 });
  });
}
