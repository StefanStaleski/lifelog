import { browserOfBucket, hostnameOf, normaliseApp } from "./sanitize";
import type { AppSpan, HostSpan, Interval } from "./windows";

/** An event as ActivityWatch's REST API returns it (`duration` in seconds). */
export interface AwEvent {
  timestamp: string;
  duration: number;
  data: Record<string, unknown>;
}

export interface AwBucket {
  id: string;
  hostname?: string;
  created?: string;
}

export interface AwInfo {
  hostname: string;
  version: string;
}

export interface AwBuckets {
  window: string | null;
  afk: string | null;
  /** browser name → bucket id */
  web: Record<string, string>;
  /** Earliest `created` of the window/afk buckets, ms. */
  createdMs: number | null;
}

function span(e: AwEvent): Interval | null {
  const start = Date.parse(e.timestamp);
  const duration = Number(e.duration);
  if (!Number.isFinite(start) || !Number.isFinite(duration) || duration < 0) return null;
  return { start, end: start + Math.round(duration * 1000) };
}

/*
 * The mappers below are the privacy boundary: they keep only the app name, the AFK status and the
 * bare hostname. Nothing else from `data` (titles, URLs, tab counts) is carried any further.
 */

export function toAppSpans(events: AwEvent[]): AppSpan[] {
  const out: AppSpan[] = [];
  for (const e of events) {
    const s = span(e);
    if (s) out.push({ ...s, app: normaliseApp(e.data.app) });
  }
  return out;
}

export function toNotAfkSpans(events: AwEvent[]): Interval[] {
  const out: Interval[] = [];
  for (const e of events) {
    const s = span(e);
    if (s && e.data.status === "not-afk") out.push(s);
  }
  return out;
}

export function toHostSpans(events: AwEvent[]): HostSpan[] {
  const out: HostSpan[] = [];
  for (const e of events) {
    const s = span(e);
    if (!s) continue;
    const host = e.data.incognito === true ? null : hostnameOf(e.data.url);
    out.push({ ...s, host });
  }
  return out;
}

/** Picks this machine's window, afk and web buckets. */
export function pickBuckets(buckets: Record<string, AwBucket>, hostname: string): AwBuckets {
  const ids = Object.keys(buckets).sort();
  const pick = (prefix: string) =>
    ids.find((id) => id === `${prefix}_${hostname}`) ??
    ids.find((id) => id.startsWith(`${prefix}_`)) ??
    null;
  const window = pick("aw-watcher-window");
  const afk = pick("aw-watcher-afk");

  const web: Record<string, string> = {};
  for (const id of ids) {
    const browser = browserOfBucket(id);
    if (!browser) continue;
    const bucketHost = buckets[id]?.hostname;
    // Prefer this machine's bucket when a browser syncs from several hosts.
    if (!web[browser] || bucketHost === hostname || id.endsWith(`_${hostname}`)) web[browser] = id;
  }

  const created = [window, afk]
    .map((id) => (id ? Date.parse(buckets[id]?.created ?? "") : NaN))
    .filter(Number.isFinite);
  return { window, afk, web, createdMs: created.length ? Math.min(...created) : null };
}

export class AwClient {
  constructor(
    private readonly baseUrl: string = "http://localhost:5600",
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private async get<T>(path: string): Promise<T> {
    const res = await this.fetchImpl(new URL(path, this.baseUrl), {
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`ActivityWatch ${path}: HTTP ${res.status}`);
    return (await res.json()) as T;
  }

  info(): Promise<AwInfo> {
    return this.get<AwInfo>("/api/0/info");
  }

  buckets(): Promise<Record<string, AwBucket>> {
    return this.get<Record<string, AwBucket>>("/api/0/buckets/");
  }

  /** Events overlapping [start, end); callers clip them. */
  events(bucketId: string, start: number, end: number): Promise<AwEvent[]> {
    const q = new URLSearchParams({
      start: new Date(start).toISOString(),
      end: new Date(end).toISOString(),
      limit: "-1",
    });
    return this.get<AwEvent[]>(`/api/0/buckets/${encodeURIComponent(bucketId)}/events?${q}`);
  }
}
