import { getDb } from "@/lib/db";
import { badRequest, dateRange, guarded } from "@/lib/http";
import { type Bucket, getSeries, isMetricName } from "@/lib/metrics";

export const dynamic = "force-dynamic";

/** `?from&to&bucket=day|week|month`: one metric as a series (average per day in each bucket). */
export function GET(req: Request, { params }: { params: Promise<{ name: string }> }) {
  return guarded(req, async () => {
    const { name } = await params;
    if (!isMetricName(name)) return badRequest(`unknown metric: ${name}`);
    const url = new URL(req.url);
    const range = dateRange(url);
    if (typeof range === "string") return badRequest(range);
    const bucket = (url.searchParams.get("bucket") ?? "day") as Bucket;
    if (!["day", "week", "month"].includes(bucket))
      return badRequest("bucket must be day, week or month");
    return Response.json(await getSeries(getDb(), name, range.from, range.to, bucket));
  });
}
