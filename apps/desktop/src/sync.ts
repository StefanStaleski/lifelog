import { toAppSpans, toHostSpans, toNotAfkSpans, pickBuckets, type AwClient } from "./aw";
import {
  EMPTY_STATE,
  readJson,
  tokenConfigured,
  writeJsonAtomic,
  type Config,
  type Paths,
  type SyncState,
} from "./config";
import {
  DesktopHeartbeatEventSchema,
  DesktopUsageEventSchema,
  MAX_BATCH_SIZE,
  type DesktopEvent,
  type DesktopHeartbeatEvent,
  type DesktopUsageEvent,
} from "./contract";
import { Queue, recordRejected } from "./queue";
import { uploadAll, type UploadOutcome } from "./upload";
import { uuidv5 } from "./uuid";
import { VERSION } from "./version";
import { buildUsageEvents, floorWindow, type HostSpan } from "./windows";

/** Watchers backdate AFK changes by up to 3 min; wait this long after a window closes. */
export const SETTLE_MS = 5 * 60_000;
/** Backfill and catch-up read ActivityWatch one day at a time. */
export const CHUNK_MS = 24 * 60 * 60_000;
/** First run: start this far before the buckets were created (aw-server's `created` may be off by the UTC offset). */
const BACKFILL_MARGIN_MS = 24 * 60 * 60_000;

export interface CollectResult {
  awReachable: boolean;
  awVersion: string | null;
  /** Why nothing was collected, if so. */
  note: string | null;
}

/**
 * Reads ActivityWatch from `syncedUntil` (or, on the first run, from the start of its data) up to
 * the last settled, complete window, calling `onChunk` per day so progress is saved as it goes.
 */
export async function collect(
  aw: AwClient,
  deviceId: string,
  syncedUntil: string | null,
  now: number,
  onChunk: (events: DesktopUsageEvent[], until: string) => void,
): Promise<CollectResult> {
  let info;
  try {
    info = await aw.info();
  } catch (e) {
    return {
      awReachable: false,
      awVersion: null,
      note: `ActivityWatch unreachable: ${(e as Error).message}`,
    };
  }
  const awVersion = String(info.version).slice(0, 32) || null;
  const buckets = pickBuckets(await aw.buckets(), info.hostname);
  if (!buckets.window || !buckets.afk) {
    return {
      awReachable: true,
      awVersion,
      note: "aw-watcher-window or aw-watcher-afk bucket missing",
    };
  }

  const to = floorWindow(now - SETTLE_MS);
  const from = syncedUntil
    ? Date.parse(syncedUntil)
    : floorWindow((buckets.createdMs ?? now) - BACKFILL_MARGIN_MS);

  for (let start = from; start < to;) {
    const end = Math.min(to, start + CHUNK_MS);
    const [windowEvents, afkEvents, ...webEvents] = await Promise.all([
      aw.events(buckets.window, start, end),
      aw.events(buckets.afk, start, end),
      ...Object.values(buckets.web).map((id) => aw.events(id, start, end)),
    ]);
    const web: Record<string, HostSpan[]> = {};
    Object.keys(buckets.web).forEach((browser, i) => {
      web[browser] = toHostSpans(webEvents[i] ?? []);
    });
    const events = buildUsageEvents(
      { focus: toAppSpans(windowEvents ?? []), notAfk: toNotAfkSpans(afkEvents ?? []), web },
      start,
      end,
      deviceId,
    ).map((e) => DesktopUsageEventSchema.parse(e) as DesktopUsageEvent);
    onChunk(events, new Date(end).toISOString());
    start = end;
  }
  return { awReachable: true, awVersion, note: null };
}

export function heartbeat(
  deviceId: string,
  now: number,
  c: CollectResult,
  pendingCount: number,
): DesktopHeartbeatEvent {
  const occurred_at = new Date(now).toISOString();
  return DesktopHeartbeatEventSchema.parse({
    id: uuidv5(`heartbeat|${deviceId}|${occurred_at}`),
    type: "desktop_heartbeat",
    occurred_at,
    device_id: deviceId,
    payload: {
      client_version: VERSION,
      aw_version: c.awVersion,
      aw_reachable: c.awReachable,
      pending_count: pendingCount,
    },
  }) as DesktopHeartbeatEvent;
}

export interface SyncDeps {
  aw: AwClient;
  config: Config;
  paths: Paths;
  now?: () => number;
  fetchImpl?: typeof fetch;
  log?: (msg: string) => void;
}

export type SyncOutcome = UploadOutcome | { kind: "skipped"; reason: string };

export interface SyncResult {
  collect: CollectResult;
  /** desktop_usage events collected in this run. */
  collected: DesktopUsageEvent[];
  /** Dry run: the batches that would be sent (queued events first). */
  batches: DesktopEvent[][];
  upload: SyncOutcome | null;
  pending: number;
}

export async function runSync(
  deps: SyncDeps,
  opts: { dryRun?: boolean } = {},
): Promise<SyncResult> {
  const now = (deps.now ?? Date.now)();
  const log = deps.log ?? (() => {});
  const { config, paths } = deps;
  const dryRun = opts.dryRun ?? false;
  const state = { ...EMPTY_STATE, ...readJson<Partial<SyncState>>(paths.state, {}) };
  const queue = new Queue(paths.queue);
  const collected: DesktopUsageEvent[] = [];

  const c = await collect(deps.aw, config.deviceId, state.synced_until, now, (events, until) => {
    collected.push(...events);
    if (dryRun) return;
    queue.add(events); // local-first: persisted before the cursor moves and before any upload
    state.synced_until = until;
    writeJsonAtomic(paths.state, state);
  });
  if (c.note) log(c.note);
  log(`collected ${collected.length} desktop_usage events up to ${state.synced_until ?? "-"}`);

  if (dryRun) {
    const queued = new Set(queue.all().map((e) => e.id));
    const pending = [...queue.all(), ...collected.filter((e) => !queued.has(e.id))];
    pending.push(heartbeat(config.deviceId, now, c, pending.length));
    const batches: DesktopEvent[][] = [];
    for (let i = 0; i < pending.length; i += MAX_BATCH_SIZE) {
      batches.push(pending.slice(i, i + MAX_BATCH_SIZE));
    }
    return { collect: c, collected, batches, upload: null, pending: pending.length };
  }

  queue.add([heartbeat(config.deviceId, now, c, queue.size)]);

  let upload: SyncOutcome;
  if (!tokenConfigured(config)) {
    upload = { kind: "skipped", reason: `no token in ${paths.config}; events stay queued` };
  } else {
    upload = await uploadAll(queue, {
      baseUrl: config.baseUrl,
      token: config.token,
      fetchImpl: deps.fetchImpl,
      onRejected: (rows) => {
        rows.forEach((r) => log(`server rejected ${r.event.type} ${r.event.id}: ${r.error}`));
        recordRejected(paths.rejected, rows);
      },
    });
  }
  log(`upload: ${describe(upload)}; ${queue.size} pending`);

  state.last_run_at = new Date(now).toISOString();
  state.last_result = describe(upload);
  writeJsonAtomic(paths.state, state);
  return { collect: c, collected, batches: [], upload, pending: queue.size };
}

export function describe(o: SyncOutcome): string {
  switch (o.kind) {
    case "done":
      return `uploaded ${o.uploaded}, rejected ${o.rejected}${o.morePending ? ", more pending" : ""}`;
    case "retry":
      return `will retry (${o.reason}), uploaded ${o.uploaded}`;
    case "failed":
      return `failed (${o.reason}), uploaded ${o.uploaded}`;
    case "skipped":
      return `skipped (${o.reason})`;
  }
}

/** Minutes per app/host, for humans (dry-run summary, status). */
export function summarise(
  events: DesktopUsageEvent[],
): { app: string; host: string | null; minutes: number }[] {
  const totals = new Map<string, { app: string; host: string | null; ms: number }>();
  for (const e of events) {
    const key = `${e.payload.app}|${e.payload.host ?? ""}`;
    const t = totals.get(key) ?? { app: e.payload.app, host: e.payload.host, ms: 0 };
    t.ms += e.payload.active_ms;
    totals.set(key, t);
  }
  return [...totals.values()]
    .sort((a, b) => b.ms - a.ms)
    .map((t) => ({ app: t.app, host: t.host, minutes: Math.round((t.ms / 60_000) * 10) / 10 }));
}
