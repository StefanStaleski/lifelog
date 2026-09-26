import { type HealthResponse, STALE_AFTER_MIN } from "@lifelog/shared";
import { sourceHealth } from "@lifelog/shared/db";
import type { Db } from "./db";

/** Last report per source and whether it has gone quiet for longer than its allowance. */
export async function getHealth(db: Db, now = new Date()): Promise<HealthResponse> {
  const rows = await db.select().from(sourceHealth).orderBy(sourceHealth.source);
  return {
    generated_at: now.toISOString(),
    sources: rows.map((r) => {
      const staleAfterMin = STALE_AFTER_MIN[r.source] ?? null;
      return {
        source: r.source,
        last_event_at: r.lastEventAt.toISOString(),
        last_error: r.lastError,
        stale_after_min: staleAfterMin,
        stale:
          staleAfterMin !== null &&
          now.getTime() - r.lastEventAt.getTime() > staleAfterMin * 60_000,
        details: (r.details as Record<string, unknown> | null) ?? null,
      };
    }),
  };
}
