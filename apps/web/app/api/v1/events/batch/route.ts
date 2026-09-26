import { EventBatchSchema } from "@lifelog/shared";
import { isDeviceAuthorized } from "@/lib/auth";
import { BodyError, readJsonBody } from "@/lib/body";
import { getDb } from "@/lib/db";
import { ingestBatch } from "@/lib/ingest";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** Phone upload: up to 500 events, optionally gzipped. Re-sending a batch is always safe. */
export async function POST(req: Request) {
  if (!isDeviceAuthorized(req)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await readJsonBody(req);
  } catch (e) {
    if (e instanceof BodyError) return Response.json({ error: e.message }, { status: e.status });
    throw e;
  }

  const batch = EventBatchSchema.safeParse(body);
  if (!batch.success) {
    const issue = batch.error.issues[0];
    const tooBig = issue?.code === "too_big";
    return Response.json(
      { error: tooBig ? "too many events in batch" : `invalid batch: ${issue?.message}` },
      { status: tooBig ? 413 : 400 },
    );
  }

  const result = await ingestBatch(getDb(), batch.data.events);
  return Response.json(result);
}
