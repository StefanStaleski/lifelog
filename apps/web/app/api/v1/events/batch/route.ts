import { DESKTOP_EVENT_TYPES, EventBatchSchema } from "@lifelog/shared";
import { uploaderOf } from "@/lib/auth";
import { BodyError, readJsonBody } from "@/lib/body";
import { getDb } from "@/lib/db";
import { ingestBatch } from "@/lib/ingest";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Upload from the phone (DEVICE_TOKEN) or the laptop (DESKTOP_TOKEN, desktop event types only):
 * up to 500 events, optionally gzipped. Re-sending a batch is always safe.
 */
export async function POST(req: Request) {
  const uploader = uploaderOf(req);
  if (!uploader) {
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

  const result = await ingestBatch(getDb(), batch.data.events, new Date(), {
    allowedTypes: uploader === "desktop" ? DESKTOP_EVENT_TYPES : undefined,
  });
  return Response.json(result);
}
