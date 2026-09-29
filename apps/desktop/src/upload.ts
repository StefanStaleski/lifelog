import { gzipSync } from "node:zlib";
import { IngestResponseSchema, MAX_BATCH_SIZE, type DesktopEvent } from "./contract";
import type { Queue } from "./queue";

export type UploadOutcome =
  | { kind: "done"; uploaded: number; rejected: number; morePending: boolean }
  /** Temporary problem (offline, 5xx, rate limit): the next run retries. Events stay queued. */
  | { kind: "retry"; reason: string; uploaded: number }
  /** Needs a human (wrong token, bad request): retrying won't help. Events stay queued. */
  | { kind: "failed"; reason: string; uploaded: number };

export interface UploadOptions {
  baseUrl: string;
  token: string;
  fetchImpl?: typeof fetch;
  batchSize?: number;
  maxBatches?: number;
  onRejected?: (rows: { event: DesktopEvent; error: string }[]) => void;
}

/** Same wire format as the phone: gzip JSON `{events}` with a bearer token. */
export function encodeBatch(events: DesktopEvent[]): Buffer {
  return gzipSync(JSON.stringify({ events }));
}

/** Drains the queue in batches; a batch is removed only after a 2xx that parses as an ack. */
export async function uploadAll(queue: Queue, opts: UploadOptions): Promise<UploadOutcome> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const batchSize = Math.min(opts.batchSize ?? MAX_BATCH_SIZE, MAX_BATCH_SIZE);
  const maxBatches = opts.maxBatches ?? 20;
  const url = new URL(
    "api/v1/events/batch",
    opts.baseUrl.endsWith("/") ? opts.baseUrl : `${opts.baseUrl}/`,
  );
  let uploaded = 0;
  let rejected = 0;

  for (let i = 0; i < maxBatches; i++) {
    const batch = queue.peek(batchSize);
    if (batch.length === 0) return { kind: "done", uploaded, rejected, morePending: false };

    let res: Response;
    try {
      res = await fetchImpl(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${opts.token}`,
          "Content-Type": "application/json",
          "Content-Encoding": "gzip",
        },
        body: new Uint8Array(encodeBatch(batch)),
        signal: AbortSignal.timeout(60_000),
      });
    } catch (e) {
      return { kind: "retry", reason: `network: ${(e as Error).message}`, uploaded };
    }

    if (!res.ok) {
      const code = res.status;
      if (code === 408 || code === 429 || code >= 500) {
        return { kind: "retry", reason: `server: HTTP ${code}`, uploaded };
      }
      if (code === 401 || code === 403) {
        return { kind: "failed", reason: `desktop token rejected (HTTP ${code})`, uploaded };
      }
      return { kind: "failed", reason: `request refused: HTTP ${code}`, uploaded };
    }

    const ack = IngestResponseSchema.safeParse(await res.json().catch(() => null));
    if (!ack.success) return { kind: "retry", reason: "unexpected response body", uploaded };

    // Rejected events were refused permanently; keep them aside instead of resending forever.
    const rows = ack.data.rejected.flatMap((r) => {
      const event = batch[r.index];
      return event ? [{ event, error: r.error }] : [];
    });
    opts.onRejected?.(rows);
    queue.ack(batch.map((e) => e.id));
    uploaded += batch.length - rows.length;
    rejected += rows.length;
  }
  return { kind: "done", uploaded, rejected, morePending: queue.size > 0 };
}
