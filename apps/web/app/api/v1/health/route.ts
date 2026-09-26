import { isDeviceAuthorized } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { getHealth } from "@/lib/health";

export const dynamic = "force-dynamic";

// Device token for now; the dashboard switches to Supabase Auth in Phase 3.
export async function GET(req: Request) {
  if (!isDeviceAuthorized(req)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  return Response.json(await getHealth(getDb()));
}
