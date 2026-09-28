import { type Event, EventSchema, type EventType } from "@lifelog/shared";
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
 * Validates each event on its own, stores the valid ones idempotently, derives the typed tables
 * from the newly stored ones and records source health, all in one transaction.
 * Invalid events are reported back but never block the rest of the batch: the phone drops them
 * instead of retrying forever.
 */
export async function ingestBatch(
  db: Db,
  rawEvents: unknown[],
  now = new Date(),
  { allowedTypes }: { allowedTypes?: readonly EventType[] } = {},
): Promise<IngestResult> {
  const valid: Event[] = [];
  const rejected: RejectedEvent[] = [];

  rawEvents.forEach((raw, index) => {
    const parsed = EventSchema.safeParse(raw);
    if (parsed.success && allowedTypes && !allowedTypes.includes(parsed.data.type)) {
      rejected.push({
        index,
        id: parsed.data.id,
        error: `type: "${parsed.data.type}" is not accepted with this token`,
      });
    } else if (parsed.success) {
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
    if (inserted.length > 0)
      await processEvents(
        tx,
        inserted.map((r) => r.id),
      );
    return new Set(inserted.map((r) => r.id));
  });

  return {
    accepted: insertedIds.size,
    duplicates: valid.length - insertedIds.size,
    rejected,
  };
}

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/** Derives typed tables and daily_summary from newly stored events (SQL: public.process_events). */
async function processEvents(tx: Tx, ids: string[]) {
  const idList = sql.join(
    ids.map((id) => sql`${id}`),
    sql`, `,
  );
  await tx.execute(sql`select public.process_events(array[${idList}]::uuid[])`);
}

async function recordSourceHealth(tx: Tx, valid: Event[], rejected: RejectedEvent[], now: Date) {
  const latestByType = new Map<string, Date>();
  for (const e of valid) {
    const at = new Date(e.occurred_at);
    const prev = latestByType.get(e.type);
    if (!prev || at > prev) latestByType.set(e.type, at);
  }

  if (latestByType.size > 0) {
    await tx
      .insert(sourceHealth)
      .values(
        [...latestByType].map(([source, lastEventAt]) => ({ source, lastEventAt, updatedAt: now })),
      )
      .onConflictDoUpdate({
        target: sourceHealth.source,
        set: {
          // Late or re-sent data must not move the watermark backwards. last_error is left alone:
          // for event sources it is owned by process_events (e.g. heartbeat warnings).
          lastEventAt: sql`greatest(${sourceHealth.lastEventAt}, excluded.last_event_at)`,
          updatedAt: sql`excluded.updated_at`,
        },
      });
  }

  if (rejected.length > 0) {
    const row = {
      source: "ingest",
      lastEventAt: now,
      lastError: `${rejected.length} event(s) rejected; first: ${rejected[0]!.error}`,
      updatedAt: now,
    };
    await tx
      .insert(sourceHealth)
      .values(row)
      .onConflictDoUpdate({ target: sourceHealth.source, set: row });
  }
}
