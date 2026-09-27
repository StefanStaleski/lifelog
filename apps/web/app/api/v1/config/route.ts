import { isDeviceAuthorized } from "@/lib/auth";
import { getConfig } from "@/lib/config";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!isDeviceAuthorized(req)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  return Response.json(await getConfig(getDb()));
}
