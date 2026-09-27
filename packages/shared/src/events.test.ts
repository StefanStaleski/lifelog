import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { EVENT_TYPES, EventBatchSchema, EventSchema, MAX_BATCH_SIZE } from "./events";

const fixturesDir = join(import.meta.dirname, "../fixtures/events");

function load(kind: "valid" | "invalid") {
  const dir = join(fixturesDir, kind);
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => [f, JSON.parse(readFileSync(join(dir, f), "utf8")) as unknown] as const);
}

describe("EventSchema fixtures", () => {
  it.each(load("valid"))("accepts valid/%s", (_name, json) => {
    const result = EventSchema.safeParse(json);
    expect(result.error?.issues).toBeUndefined();
  });

  // The path of the issue each invalid fixture must fail on, so it can't pass by accident.
  const expectedIssuePath: Record<string, string> = {
    "app_usage-ended-before-start.json": "ended_at",
    "app_usage-foreground-exceeds-window.json": "payload.foreground_ms",
    "checkin-mood-out-of-range.json": "payload.mood",
    "unknown-type.json": "type",
    "unlock-id-not-uuid.json": "id",
    "unlock-local-offset.json": "occurred_at",
    "unlock-payload-text.json": "payload",
    "steps-not-whole-hour.json": "ended_at",
    "stay-too-short.json": "ended_at",
    "stay-precise-coordinates.json": "payload.lat",
    "activity-unknown-kind.json": "payload.activity",
    "notifications-with-text.json": "payload",
  };

  it.each(load("invalid"))("rejects invalid/%s", (name, json) => {
    const result = EventSchema.safeParse(json);
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((i) => i.path.join("."))).toEqual([expectedIssuePath[name]]);
  });

  it("has a valid fixture for every event type", () => {
    const covered = new Set(load("valid").map(([, json]) => (json as { type: string }).type));
    expect([...covered].sort()).toEqual([...EVENT_TYPES].sort());
  });
});

describe("EventBatchSchema", () => {
  const event = load("valid")[0]![1];

  it("accepts 1 to MAX_BATCH_SIZE events", () => {
    expect(EventBatchSchema.safeParse({ events: [event] }).success).toBe(true);
    const full = { events: Array.from({ length: MAX_BATCH_SIZE }, () => event) };
    expect(EventBatchSchema.safeParse(full).success).toBe(true);
  });

  it("rejects empty and oversized batches", () => {
    expect(EventBatchSchema.safeParse({ events: [] }).success).toBe(false);
    const over = { events: Array.from({ length: MAX_BATCH_SIZE + 1 }, () => event) };
    expect(EventBatchSchema.safeParse(over).success).toBe(false);
  });
});
