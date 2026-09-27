import { isDeviceAuthorized } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { getGate } from "@/lib/gate";

export const dynamic = "force-dynamic";

/** Phase gate check: `?days=7` (1–90). */
export async function GET(req: Request) {
  if (!isDeviceAuthorized(req)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const days = Number(new URL(req.url).searchParams.get("days") ?? "7");
  if (!Number.isInteger(days) || days < 1 || days > 90) {
    return Response.json({ error: "days must be an integer from 1 to 90" }, { status: 400 });
  }
  return Response.json(await getGate(getDb(), days));
}
