import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import type { DesktopUsageEvent } from "../src/contract";
import { Queue, recordRejected } from "../src/queue";
import { uploadAll } from "../src/upload";
import { usageEventId } from "../src/uuid";
import { tempPaths } from "./helpers";

function usage(i: number): DesktopUsageEvent {
  const start = Date.parse("2026-09-28T00:00:00Z") + i * 1_800_000;
  const occurred_at = new Date(start).toISOString();
  return {
    id: usageEventId(occurred_at, "code", null),
    type: "desktop_usage",
    occurred_at,
    ended_at: new Date(start + 1_800_000).toISOString(),
    device_id: "laptop",
    payload: { app: "code", host: null, active_ms: 60_000 },
  };
}

interface Sent {
  url: string;
  headers: Headers;
  events: DesktopUsageEvent[];
}

function server(respond: (sent: Sent, n: number) => Response | Promise<Response>) {
  const sent: Sent[] = [];
  const impl = (async (input: string | URL | Request, init?: RequestInit) => {
    const body = gunzipSync(Buffer.from(init!.body as Uint8Array)).toString("utf8");
    const s = {
      url: String(input),
      headers: new Headers(init!.headers),
      events: JSON.parse(body).events,
    };
    sent.push(s);
    return respond(s, sent.length);
  }) as typeof fetch;
  return { impl, sent };
}

const ok = (s: Sent) => Response.json({ accepted: s.events.length, duplicates: 0, rejected: [] });

describe("Queue", () => {
  it("persists, dedupes by id and removes only acked ids", () => {
    const { queue: file } = tempPaths();
    const q = new Queue(file);
    expect(q.add([usage(0), usage(1)])).toBe(2);
    expect(q.add([usage(1), usage(2)])).toBe(1);
    expect(new Queue(file).size).toBe(3);
    q.ack([usage(0).id, "not-queued"]);
    expect(new Queue(file).all().map((e) => e.id)).toEqual([usage(1).id, usage(2).id]);
  });

  it("appends rejected events to a log", () => {
    const { rejected } = tempPaths();
    recordRejected(rejected, [{ event: usage(0), error: "unknown type" }]);
    const line = JSON.parse(readFileSync(rejected, "utf8").trim());
    expect(line.event.id).toBe(usage(0).id);
    expect(line.error).toBe("unknown type");
  });
});

describe("uploadAll", () => {
  it("sends gzip JSON batches of ≤500 with the bearer token and acks them", async () => {
    const q = new Queue(tempPaths().queue);
    q.add(Array.from({ length: 1201 }, (_, i) => usage(i)));
    const { impl, sent } = server(ok);
    const out = await uploadAll(q, {
      baseUrl: "https://example.test",
      token: "t0k",
      fetchImpl: impl,
    });
    expect(out).toEqual({ kind: "done", uploaded: 1201, rejected: 0, morePending: false });
    expect(sent.map((s) => s.events.length)).toEqual([500, 500, 201]);
    expect(sent[0]!.url).toBe("https://example.test/api/v1/events/batch");
    expect(sent[0]!.headers.get("authorization")).toBe("Bearer t0k");
    expect(sent[0]!.headers.get("content-encoding")).toBe("gzip");
    expect(q.size).toBe(0);
  });

  it("keeps the queue on network errors, 5xx and auth failures", async () => {
    for (const [respond, kind] of [
      [() => Promise.reject(new TypeError("fetch failed")), "retry"],
      [() => new Response("boom", { status: 503 }), "retry"],
      [() => new Response("{}", { status: 200 }), "retry"], // not an ack
      [() => new Response("no", { status: 401 }), "failed"],
      [() => new Response("bad", { status: 400 }), "failed"],
    ] as const) {
      const q = new Queue(tempPaths().queue);
      q.add([usage(0), usage(1)]);
      const out = await uploadAll(q, {
        baseUrl: "http://x",
        token: "t",
        fetchImpl: server(respond).impl,
      });
      expect(out.kind).toBe(kind);
      expect(q.size).toBe(2);
    }
  });

  it("removes a batch once acked, keeps later batches after a failure", async () => {
    const q = new Queue(tempPaths().queue);
    q.add(Array.from({ length: 700 }, (_, i) => usage(i)));
    const { impl } = server((s, n) => (n === 1 ? ok(s) : new Response("", { status: 502 })));
    const out = await uploadAll(q, { baseUrl: "http://x", token: "t", fetchImpl: impl });
    expect(out).toEqual({ kind: "retry", reason: "server: HTTP 502", uploaded: 500 });
    expect(q.size).toBe(200);
    expect(q.peek(1)[0]!.id).toBe(usage(500).id);
  });

  it("sets rejected events aside and acks the rest (duplicates count as acked)", async () => {
    const q = new Queue(tempPaths().queue);
    q.add([usage(0), usage(1), usage(2)]);
    const rejected: string[] = [];
    const { impl } = server((s) =>
      Response.json({
        accepted: 1,
        duplicates: 1,
        rejected: [{ index: 2, id: s.events[2]!.id, error: "bad" }],
      }),
    );
    const out = await uploadAll(q, {
      baseUrl: "http://x/",
      token: "t",
      fetchImpl: impl,
      onRejected: (rows) => rejected.push(...rows.map((r) => r.event.id)),
    });
    expect(out).toEqual({ kind: "done", uploaded: 2, rejected: 1, morePending: false });
    expect(rejected).toEqual([usage(2).id]);
    expect(q.size).toBe(0);
  });
});
