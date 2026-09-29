import { WINDOW_MS, type DesktopUsageEvent } from "./contract";
import { appMatchesBrowser } from "./sanitize";
import { usageEventId } from "./uuid";

/** Half-open [start, end) in epoch ms. */
export interface Interval {
  start: number;
  end: number;
}
export interface AppSpan extends Interval {
  app: string;
}
export interface HostSpan extends Interval {
  host: string | null;
}
export interface UsageSpan extends Interval {
  app: string;
  host: string | null;
}

/** Drops events under a second: title flicker, not use. */
export const MIN_ACTIVE_MS = 1000;

export const floorWindow = (ms: number) => Math.floor(ms / WINDOW_MS) * WINDOW_MS;

/**
 * Makes spans non-overlapping: sorted by start, each one ends where the next begins. Watchers'
 * heartbeat merging can leave small overlaps; one moment can only have one focused window.
 */
export function flatten<T extends Interval>(spans: T[]): T[] {
  const sorted = spans.filter((s) => s.end > s.start).sort((a, b) => a.start - b.start);
  const out: T[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const cur = sorted[i]!;
    const next = sorted[i + 1];
    const end = next ? Math.min(cur.end, next.start) : cur.end;
    if (end > cur.start) out.push({ ...cur, end });
  }
  return out;
}

/**
 * aw-watcher-window polls every second and starts a new zero-length event whenever the title
 * changes, so an event's own duration undercounts (a terminal with a spinner in its title looks
 * idle). A span therefore lasts until the next one starts, when that gap is at most `maxGapMs`
 * (a longer gap means the watcher wasn't running: suspend, shutdown).
 */
export function bridge<T extends Interval>(spans: T[], maxGapMs: number): T[] {
  const sorted = [...spans].sort((a, b) => a.start - b.start);
  return sorted.map((cur, i) => {
    const next = sorted[i + 1];
    if (next && next.start > cur.end && next.start - cur.end <= maxGapMs) {
      return { ...cur, end: next.start };
    }
    return cur;
  });
}

/** Max gap bridged between window events (poll interval 1 s, pulsetime 2 s). */
export const WINDOW_BRIDGE_MS = 5_000;
/** Max gap bridged between browser tab events. */
export const WEB_BRIDGE_MS = 30_000;

/** Union of intervals, sorted and merged. */
export function union(intervals: Interval[]): Interval[] {
  const sorted = intervals.filter((s) => s.end > s.start).sort((a, b) => a.start - b.start);
  const out: Interval[] = [];
  for (const s of sorted) {
    const last = out[out.length - 1];
    if (last && s.start <= last.end) last.end = Math.max(last.end, s.end);
    else out.push({ start: s.start, end: s.end });
  }
  return out;
}

/** Parts of `spans` (sorted, non-overlapping) covered by `mask` (sorted, merged). */
export function intersect<T extends Interval>(spans: T[], mask: Interval[]): T[] {
  const out: T[] = [];
  let j = 0;
  for (const s of spans) {
    while (j < mask.length && mask[j]!.end <= s.start) j++;
    for (let k = j; k < mask.length && mask[k]!.start < s.end; k++) {
      const start = Math.max(s.start, mask[k]!.start);
      const end = Math.min(s.end, mask[k]!.end);
      if (end > start) out.push({ ...s, start, end });
    }
  }
  return out;
}

/**
 * Splits focused browser time by the active tab's hostname. Time in a browser that no web
 * watcher covers keeps `host: null`.
 */
export function attachHosts(focus: AppSpan[], web: Record<string, HostSpan[]>): UsageSpan[] {
  const webFlat = Object.fromEntries(
    Object.entries(web).map(([b, spans]) => [b, flatten(bridge(spans, WEB_BRIDGE_MS))]),
  );
  const out: UsageSpan[] = [];
  for (const f of focus) {
    const browser = Object.keys(webFlat).find((b) => appMatchesBrowser(f.app, b));
    const tabs = browser ? webFlat[browser]! : [];
    let cursor = f.start;
    for (const t of tabs) {
      if (t.end <= f.start || t.start >= f.end) continue;
      const start = Math.max(f.start, t.start);
      const end = Math.min(f.end, t.end);
      if (start > cursor) out.push({ start: cursor, end: start, app: f.app, host: null });
      out.push({ start, end, app: f.app, host: t.host });
      cursor = end;
    }
    if (cursor < f.end) out.push({ start: cursor, end: f.end, app: f.app, host: null });
  }
  return out;
}

export interface UsageRow {
  windowStart: number;
  app: string;
  host: string | null;
  activeMs: number;
}

/** Sums spans per (30-min window, app, host) inside [from, to); `from`/`to` are window-aligned. */
export function bucketize(spans: UsageSpan[], from: number, to: number): UsageRow[] {
  const rows = new Map<string, UsageRow>();
  for (const s of spans) {
    let start = Math.max(s.start, from);
    const end = Math.min(s.end, to);
    while (start < end) {
      const windowStart = floorWindow(start);
      const pieceEnd = Math.min(end, windowStart + WINDOW_MS);
      const key = `${windowStart}|${s.app}|${s.host ?? ""}`;
      const row = rows.get(key) ?? { windowStart, app: s.app, host: s.host, activeMs: 0 };
      row.activeMs += pieceEnd - start;
      rows.set(key, row);
      start = pieceEnd;
    }
  }
  return [...rows.values()]
    .map((r) => ({ ...r, activeMs: Math.min(WINDOW_MS, Math.round(r.activeMs)) }))
    .filter((r) => r.activeMs >= MIN_ACTIVE_MS)
    .sort(
      (a, b) =>
        a.windowStart - b.windowStart ||
        a.app.localeCompare(b.app) ||
        (a.host ?? "").localeCompare(b.host ?? ""),
    );
}

export interface WindowInput {
  focus: AppSpan[];
  notAfk: Interval[];
  web: Record<string, HostSpan[]>;
}

/** Focused ∩ not-AFK time → one desktop_usage event per (window, app, host) in [from, to). */
export function buildUsageEvents(
  input: WindowInput,
  from: number,
  to: number,
  deviceId: string,
): DesktopUsageEvent[] {
  if (from % WINDOW_MS !== 0 || to % WINDOW_MS !== 0)
    throw new Error("range must be window-aligned");
  const active = intersect(flatten(bridge(input.focus, WINDOW_BRIDGE_MS)), union(input.notAfk));
  return bucketize(attachHosts(active, input.web), from, to).map((r) => {
    const occurred_at = new Date(r.windowStart).toISOString();
    return {
      id: usageEventId(occurred_at, r.app, r.host),
      type: "desktop_usage",
      occurred_at,
      ended_at: new Date(r.windowStart + WINDOW_MS).toISOString(),
      device_id: deviceId,
      payload: { app: r.app, host: r.host, active_ms: r.activeMs },
    };
  });
}
