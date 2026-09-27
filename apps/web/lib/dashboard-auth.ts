import { isDeviceAuthorized } from "@/lib/auth";
import { getOwner } from "@/lib/supabase/server";

/** Read routes used by the dashboard accept the owner's session; the phone and scripts use the token. */
export async function isDashboardAuthorized(req: Request): Promise<boolean> {
  return isDeviceAuthorized(req) || (await getOwner()) !== null;
}
