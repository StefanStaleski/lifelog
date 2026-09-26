import { type Event, EventSchema } from "@lifelog/shared";
import { events, sourceHealth } from "@lifelog/shared/db";
import { sql } from "drizzle-orm";
import type { Db } from "./db";

export type RejectedEvent = { index: number; id: string | null; error: string };

export type IngestResult = {
  accepted: number;
  duplicates: number;
  rejected: RejectedEvent[];
};

/**
 * Validates each event on its own, stores the valid ones idempotently and records source health.
 * Invalid events are reported back but never block the rest of the batch: the phone drops them
 * instead of retrying forever.
 */
export async function ingestBatch(
  db: Db,
  rawEvents: unknown[],
  now = new Date(),
): Promise<IngestResult> {
  const valid: Event[] = [];
  const rejected: RejectedEvent[] = [];

  rawEvents.forEach((raw, index) => {
    const parsed = EventSchema.safeParse(raw);
    if (parsed.success) {
      valid.push(parsed.data);
    } else {
      const id = (raw as { id?: unknown } | null)?.id;
      const issue = parsed.error.issues[0];
      rejected.push({
        index,
        id: typeof id === "string" ? id : null,
        error: issue ? `${issue.path.join(".") || "event"}: ${issue.message}` : "invalid event",
      });
    }
  });

  const insertedIds = await db.transaction(async (tx) => {
    const inserted =
      valid.length === 0
        ? []
        : await tx
            .insert(events)
            .values(
              valid.map((e) => ({
                id: e.id,
                type: e.type,
                occurredAt: new Date(e.occurred_at),
                endedAt: "ended_at" in e ? new Date(e.ended_at) : null,
                payload: e.payload,
                deviceId: e.device_id,
                receivedAt: now,
              })),
            )
            .onConflictDoNothing({ target: events.id })
            .returning({ id: events.id });

    await recordSourceHealth(tx, valid, rejected, now);
    return new Set(inserted.map((r) => r.id));
  });

  return {
    accepted: insertedIds.size,
    duplicates: valid.length - insertedIds.size,
    rejected,
  };
}

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

async function recordSourceHealth(tx: Tx, valid: Event[], rejected: RejectedEvent[], now: Date) {
  const latestByType = new Map<string, Date>();
  for (const e of valid) {
    const at = new Date(e.occurred_at);
    const prev = latestByType.get(e.type);
    if (!prev || at > prev) latestByType.set(e.type, at);
  }

  const rows: (typeof sourceHealth.$inferInsert)[] = [...latestByType].map(
    ([source, lastEventAt]) => ({
      source,
      lastEventAt,
      lastError: null,
      updatedAt: now,
    }),
  );
  if (rejected.length > 0) {
    const first = rejected[0]!;
    rows.push({
      source: "ingest",
      lastEventAt: now,
      lastError: `${rejected.length} event(s) rejected; first: ${first.error}`,
      updatedAt: now,
    });
  }
  if (rows.length === 0) return;

  await tx
    .insert(sourceHealth)
    .values(rows)
    .onConflictDoUpdate({
      target: sourceHealth.source,
      set: {
        // Late or re-sent data must not move the watermark backwards.
        lastEventAt: sql`greatest(${sourceHealth.lastEventAt}, excluded.last_event_at)`,
        lastError: sql`excluded.last_error`,
        updatedAt: sql`excluded.updated_at`,
      },
    });
}
