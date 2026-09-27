import { getDb } from "@/lib/db";
import { badRequest, dateRange, guarded } from "@/lib/http";
import { getSummary } from "@/lib/metrics";

export const dynamic = "force-dynamic";

/** `?from&to`: daily_summary rows plus each metric's 30-day baseline. */
export function GET(req: Request) {
  return guarded(req, async () => {
    const range = dateRange(new URL(req.url));
    if (typeof range === "string") return badRequest(range);
    return Response.json(await getSummary(getDb(), range.from, range.to));
  });
}
