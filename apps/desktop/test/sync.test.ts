import { existsSync, readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { AwClient, pickBuckets } from "../src/aw";
import { ConfigSchema, PLACEHOLDER_TOKEN, loadConfig } from "../src/config";
import { EventSchema } from "@lifelog/shared";
import type { DesktopEvent } from "../src/contract";
import { Queue } from "../src/queue";
import { runSync, summarise } from "../src/sync";
import { at, fakeAwFetch, fixture, tempPaths } from "./helpers";

const NOW = at("11:40:00"); // last settled complete window ends 11:30
const config = ConfigSchema.parse({ baseUrl: "https://lifelog.test", token: "desktop-token" });

function ingest() {
  const received: DesktopEvent[] = [];
  const impl = (async (_url: string | URL | Request, init?: RequestInit) => {
    const events = JSON.parse(gunzipSync(Buffer.from(init!.body as Uint8Array)).toString()).events;
    received.push(...events);
    return Response.json({ accepted: events.length, duplicates: 0, rejected: [] });
  }) as typeof fetch;
  return { impl, received };
}

describe("pickBuckets", () => {
  it("picks this host's window/afk buckets and any web buckets", () => {
    const b = pickBuckets(fixture("aw-buckets.json"), "laptop-host");
    expect(b.window).toBe("aw-watcher-window_laptop-host");
    expect(b.afk).toBe("aw-watcher-afk_laptop-host");
    expect(b.web).toEqual({ firefox: "aw-watcher-web-firefox_laptop-host" });
    expect(b.createdMs).toBe(at("09:00:00"));
  });
});

describe("runSync", () => {
  it("backfills from the start of AW data, queues first, uploads, then only new windows", async () => {
    const paths = tempPaths();
    const aw = new AwClient("http://localhost:5600", fakeAwFetch());
    const server = ingest();
    const first = await runSync({ aw, config, paths, now: () => NOW, fetchImpl: server.impl });

    expect(first.collected.map((e) => e.occurred_at.slice(11, 16))).toEqual([
      "10:00",
      "10:00",
      "10:00",
      "10:00",
      "10:00",
      "10:30",
      "11:00",
    ]);
    expect(first.upload).toEqual({ kind: "done", uploaded: 8, rejected: 0, morePending: false });
    expect(server.received.map((e) => e.type)).toEqual([
      ...Array(7).fill("desktop_usage"),
      "desktop_heartbeat",
    ]);
    for (const e of server.received) expect(EventSchema.safeParse(e).success).toBe(true);
    const hb = server.received.at(-1)!;
    expect(hb.payload).toEqual({
      client_version: "0.1.0",
      aw_version: "v0.13.2",
      aw_reachable: true,
      pending_count: 7,
    });
    expect(hb.device_id).toBe("laptop");

    const state = JSON.parse(readFileSync(paths.state, "utf8"));
    expect(state.synced_until).toBe("2026-09-28T11:30:00.000Z");
    expect(new Queue(paths.queue).size).toBe(0);

    // Next run, same data: nothing collected again, only a heartbeat.
    const again = await runSync({
      aw,
      config,
      paths,
      now: () => NOW + 60_000,
      fetchImpl: server.impl,
    });
    expect(again.collected).toEqual([]);
    expect(server.received.length).toBe(9);
  });

  it("keeps everything queued when the upload fails, and sends it later without duplicates", async () => {
    const paths = tempPaths();
    const aw = new AwClient("http://localhost:5600", fakeAwFetch());
    const down = (async () => {
      throw new TypeError("fetch failed");
    }) as typeof fetch;
    const first = await runSync({ aw, config, paths, now: () => NOW, fetchImpl: down });
    expect(first.upload?.kind).toBe("retry");
    expect(new Queue(paths.queue).size).toBe(8);

    const server = ingest();
    await runSync({ aw, config, paths, now: () => NOW + 1_800_000, fetchImpl: server.impl });
    const ids = server.received.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(server.received.filter((e) => e.type === "desktop_usage")).toHaveLength(7);
    expect(new Queue(paths.queue).size).toBe(0);
  });

  it("skips upload with the placeholder token and keeps the queue", async () => {
    const paths = tempPaths();
    const aw = new AwClient("http://localhost:5600", fakeAwFetch());
    const cfg = ConfigSchema.parse({ token: PLACEHOLDER_TOKEN });
    const result = await runSync({ aw, config: cfg, paths, now: () => NOW });
    expect(result.upload?.kind).toBe("skipped");
    expect(new Queue(paths.queue).size).toBe(8);
  });

  it("dry run prints batches and writes nothing", async () => {
    const paths = tempPaths();
    const aw = new AwClient("http://localhost:5600", fakeAwFetch());
    const result = await runSync({ aw, config, paths, now: () => NOW }, { dryRun: true });
    expect(result.batches).toHaveLength(1);
    expect(result.batches[0]!.map((e) => e.type).at(-1)).toBe("desktop_heartbeat");
    expect(existsSync(paths.queue)).toBe(false);
    expect(existsSync(paths.state)).toBe(false);
    expect(summarise(result.collected)[0]).toEqual({ app: "code", host: null, minutes: 40 });
  });

  it("still sends a heartbeat when ActivityWatch is down, without moving the cursor", async () => {
    const paths = tempPaths();
    const aw = new AwClient("http://localhost:5600", fakeAwFetch({ down: true }));
    const server = ingest();
    const result = await runSync({ aw, config, paths, now: () => NOW, fetchImpl: server.impl });
    expect(result.collected).toEqual([]);
    expect(server.received).toHaveLength(1);
    expect(server.received[0]!.payload).toMatchObject({ aw_reachable: false, aw_version: null });
    expect(JSON.parse(readFileSync(paths.state, "utf8")).synced_until).toBeNull();
  });
});

describe("config", () => {
  it("defaults to localhost and the placeholder token when the file is missing", () => {
    expect(loadConfig(tempPaths().config)).toEqual({
      baseUrl: "http://localhost:3000",
      token: PLACEHOLDER_TOKEN,
      deviceId: "laptop",
      awUrl: "http://localhost:5600",
    });
  });
});
