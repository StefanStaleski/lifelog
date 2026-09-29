import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AwEvent } from "../src/aw";
import { defaultPaths, type Paths } from "../src/config";

export function fixture<T>(name: string): T {
  return JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8")) as T;
}

export const at = (hhmmss: string) => Date.parse(`2026-09-28T${hhmmss}Z`);

export function tempPaths(): Paths {
  const dir = mkdtempSync(join(tmpdir(), "lifelog-desktop-"));
  return defaultPaths({
    XDG_CONFIG_HOME: join(dir, "config"),
    XDG_STATE_HOME: join(dir, "state"),
  });
}

/** Clips events to [start, end) like aw-server does for `?start=&end=`. */
function clip(events: AwEvent[], start: number, end: number): AwEvent[] {
  return events.flatMap((e) => {
    const s = Date.parse(e.timestamp);
    const f = s + e.duration * 1000;
    if (f < start || s >= end) return [];
    const cs = Math.max(s, start);
    const cf = Math.min(f, end);
    return [{ ...e, timestamp: new Date(cs).toISOString(), duration: (cf - cs) / 1000 }];
  });
}

/** A fake ActivityWatch REST server serving the fixtures. */
export function fakeAwFetch(opts: { down?: boolean } = {}): typeof fetch & { calls: string[] } {
  const events: Record<string, AwEvent[]> = {
    "aw-watcher-window_laptop-host": fixture("aw-window.json"),
    "aw-watcher-afk_laptop-host": fixture("aw-afk.json"),
    "aw-watcher-web-firefox_laptop-host": fixture("aw-web-firefox.json"),
    "aw-watcher-window_other-pc": [],
  };
  const calls: string[] = [];
  const impl = async (input: string | URL | Request) => {
    const url = new URL(input instanceof Request ? input.url : input);
    calls.push(url.pathname + url.search);
    if (opts.down) throw new TypeError("fetch failed: ECONNREFUSED");
    if (url.pathname === "/api/0/info") return Response.json(fixture("aw-info.json"));
    if (url.pathname === "/api/0/buckets/") return Response.json(fixture("aw-buckets.json"));
    const m = /^\/api\/0\/buckets\/([^/]+)\/events$/.exec(url.pathname);
    if (m) {
      const start = Date.parse(url.searchParams.get("start")!);
      const end = Date.parse(url.searchParams.get("end")!);
      return Response.json(clip(events[decodeURIComponent(m[1]!)] ?? [], start, end));
    }
    return new Response("not found", { status: 404 });
  };
  return Object.assign(impl as typeof fetch, { calls });
}
