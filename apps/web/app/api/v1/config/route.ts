import { isDeviceAuthorized } from "@/lib/auth";
import { getConfig } from "@/lib/config";

export const dynamic = "force-dynamic";

export function GET(req: Request) {
  if (!isDeviceAuthorized(req)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  return Response.json(getConfig());
}
