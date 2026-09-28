import { describe, expect, it } from "vitest";
import { toAppSpans, toHostSpans, toNotAfkSpans, type AwEvent } from "../src/aw";
import { DesktopUsageEventSchema, WINDOW_MS } from "../src/contract";
import {
  attachHosts,
  bridge,
  bucketize,
  buildUsageEvents,
  flatten,
  intersect,
  union,
  type WindowInput,
} from "../src/windows";
import { at, fixture } from "./helpers";

const iv = (a: string, b: string) => ({ start: at(a), end: at(b) });

function fixtureInput(): WindowInput {
  return {
    focus: toAppSpans(fixture<AwEvent[]>("aw-window.json")),
    notAfk: toNotAfkSpans(fixture<AwEvent[]>("aw-afk.json")),
    web: { firefox: toHostSpans(fixture<AwEvent[]>("aw-web-firefox.json")) },
  };
}

describe("interval helpers", () => {
  it("flatten truncates overlaps so one moment has one focused window", () => {
    expect(
      flatten([
        { ...iv("10:00:00", "10:10:00"), app: "a" },
        { ...iv("10:05:00", "10:06:00"), app: "b" },
      ]),
    ).toEqual([
      { ...iv("10:00:00", "10:05:00"), app: "a" },
      { ...iv("10:05:00", "10:06:00"), app: "b" },
    ]);
  });

  it("bridge extends zero-length title events up to the next event, but not across long gaps", () => {
    const spans = [
      { ...iv("10:00:00", "10:00:00"), app: "t" },
      { ...iv("10:00:01", "10:00:01"), app: "t" },
      { ...iv("10:00:02", "10:00:04"), app: "t" },
      { ...iv("10:10:00", "10:10:05"), app: "t" },
    ];
    expect(bridge(spans, 5000)).toEqual([
      { ...iv("10:00:00", "10:00:01"), app: "t" },
      { ...iv("10:00:01", "10:00:02"), app: "t" },
      { ...iv("10:00:02", "10:00:04"), app: "t" },
      { ...iv("10:10:00", "10:10:05"), app: "t" },
    ]);
  });

  it("union merges and intersect clips to the mask", () => {
    const mask = union([
      iv("10:20:00", "10:30:00"),
      iv("10:00:00", "10:10:00"),
      iv("10:05:00", "10:12:00"),
    ]);
    expect(mask).toEqual([iv("10:00:00", "10:12:00"), iv("10:20:00", "10:30:00")]);
    expect(intersect([{ ...iv("10:08:00", "10:25:00"), app: "x" }], mask)).toEqual([
      { ...iv("10:08:00", "10:12:00"), app: "x" },
      { ...iv("10:20:00", "10:25:00"), app: "x" },
    ]);
  });

  it("attachHosts splits browser time by tab and leaves other apps alone", () => {
    const out = attachHosts(
      [
        { ...iv("10:00:00", "10:10:00"), app: "firefox" },
        { ...iv("10:10:00", "10:20:00"), app: "code" },
      ],
      {
        firefox: [
          { ...iv("10:02:00", "10:05:00"), host: "github.com" },
          { ...iv("10:12:00", "10:15:00"), host: "x.com" },
        ],
      },
    );
    expect(out).toEqual([
      { ...iv("10:00:00", "10:02:00"), app: "firefox", host: null },
      { ...iv("10:02:00", "10:05:00"), app: "firefox", host: "github.com" },
      { ...iv("10:05:00", "10:10:00"), app: "firefox", host: null },
      { ...iv("10:10:00", "10:20:00"), app: "code", host: null },
    ]);
  });

  it("bucketize splits spans at 30-min UTC boundaries, caps at the window and drops blips", () => {
    const rows = bucketize(
      [
        { ...iv("10:20:00", "10:40:00"), app: "code", host: null },
        { ...iv("10:40:00", "10:40:00.500"), app: "blip", host: null },
        // two copies can't exceed the window (defensive cap)
        { ...iv("11:00:00", "11:30:00"), app: "x", host: null },
        { ...iv("11:00:00", "11:30:00"), app: "x", host: null },
      ],
      at("10:00:00"),
      at("11:30:00"),
    );
    expect(rows).toEqual([
      { windowStart: at("10:00:00"), app: "code", host: null, activeMs: 600_000 },
      { windowStart: at("10:30:00"), app: "code", host: null, activeMs: 600_000 },
      { windowStart: at("11:00:00"), app: "x", host: null, activeMs: WINDOW_MS },
    ]);
  });
});

describe("buildUsageEvents (fixture day)", () => {
  const events = buildUsageEvents(fixtureInput(), at("09:30:00"), at("11:30:00"), "laptop");
  const rows = events.map((e) => [
    e.occurred_at.slice(11, 16),
    e.payload.app,
    e.payload.host,
    e.payload.active_ms,
  ]);

  it("intersects focus with not-AFK, per app and hostname", () => {
    expect(rows).toEqual([
      // 09:55–10:00 code is before the first not-afk event: not counted
      ["10:00", "code", null, 300_000 + 297_000],
      ["10:00", "firefox", null, 300_000], // incognito tab: time counted, no host
      ["10:00", "firefox", "github.com", 600_000],
      ["10:00", "firefox", "mail.google.com", 300_000],
      ["10:00", "gnome-terminal", null, 3_000], // zero-length title events bridged
      ["10:30", "code", null, 600_000 + 600_000], // 10:40–10:50 AFK excluded
      ["11:00", "code", null, 600_000],
    ]);
  });

  it("never exceeds the window, even summed over apps", () => {
    const perWindow = new Map<string, number>();
    for (const e of events) {
      perWindow.set(e.occurred_at, (perWindow.get(e.occurred_at) ?? 0) + e.payload.active_ms);
    }
    for (const total of perWindow.values()) expect(total).toBeLessThanOrEqual(WINDOW_MS);
    expect(perWindow.get("2026-09-28T10:00:00.000Z")).toBe(WINDOW_MS);
  });

  it("produces valid wire events with deterministic ids", () => {
    for (const e of events) expect(DesktopUsageEventSchema.safeParse(e).success).toBe(true);
    const again = buildUsageEvents(fixtureInput(), at("09:30:00"), at("11:30:00"), "laptop");
    expect(again.map((e) => e.id)).toEqual(events.map((e) => e.id));
    expect(new Set(events.map((e) => e.id)).size).toBe(events.length);
  });

  it("never leaks titles, URLs, paths or queries", () => {
    const wire = JSON.stringify(events);
    for (const secret of [
      "secret",
      "private",
      "token",
      "Bank",
      "diary",
      "notes.txt",
      "Inbox",
      "someone@",
      "prod-db",
      "ycombinator", // tab visible while another app was focused
      "https:",
      "/home",
      "?",
      "#",
      "title",
      "url",
    ]) {
      expect(wire).not.toContain(secret);
    }
    for (const e of events) {
      expect(Object.keys(e.payload).sort()).toEqual(["active_ms", "app", "host"]);
    }
  });

  it("rejects ranges that aren't window-aligned", () => {
    expect(() =>
      buildUsageEvents(fixtureInput(), at("10:10:00"), at("11:00:00"), "laptop"),
    ).toThrow();
  });
});
