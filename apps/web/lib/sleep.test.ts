import { randomUUID } from "node:crypto";
import { dailySummary, events, sleepEstimates } from "@lifelog/shared/db";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/lib/db";
import { resetDb } from "@/test/helpers";
import { ingestBatch } from "./ingest";

// All times UTC; Europe/Skopje is UTC+2 in September. Night of 26→27 Sep ends on "2026-09-27".
const db = () => getDb();
beforeEach(resetDb);
afterAll(closeDb);

const base = { device_id: "s24" };
const unlock = (at: string) => ({
  ...base,
  id: randomUUID(),
  type: "unlock",
  occurred_at: at,
  payload: {},
});
const screen = (at: string, state: "on" | "off") => ({
  ...base,
  id: randomUUID(),
  type: "screen",
  occurred_at: at,
  payload: { state },
});
const heartbeat = (at: string, charging: boolean) => ({
  ...base,
  id: randomUUID(),
  type: "heartbeat",
  occurred_at: at,
  payload: {
    app_version: "0.2.0",
    pending_count: 0,
    collection_paused: false,
    usage_access_granted: true,
    battery_optimization_ignored: true,
    charging,
  },
});
const activity = (at: string, a: string, transition: "enter" | "exit") => ({
  ...base,
  id: randomUUID(),
  type: "activity",
  occurred_at: at,
  payload: { activity: a, transition },
});

const night = () => [
  unlock("2026-09-26T20:30:00Z"), // 22:30 local
  unlock("2026-09-26T21:40:00Z"), // 23:40
  screen("2026-09-26T21:55:00Z", "off"), // 23:55: last session ends
  unlock("2026-09-27T05:10:00Z"), // 07:10 wake
];
const estimate = async (date = "2026-09-27") =>
  (await db().select().from(sleepEstimates).where(eq(sleepEstimates.date, date)))[0];

describe("sleep estimate", () => {
  it("starts at the last screen-off before the quiet stretch and ends at the first unlock", async () => {
    await ingestBatch(db(), night());
    expect(await estimate()).toMatchObject({
      sleepStart: new Date("2026-09-26T21:55:00Z"),
      wakeAt: new Date("2026-09-27T05:10:00Z"),
      durationMin: 435,
      confidence: 0.8, // 0.5 + screen-off + plausible length
      corrected: false,
    });
    const [day] = await db().select().from(dailySummary).where(eq(dailySummary.date, "2026-09-27"));
    expect(day).toMatchObject({ sleepMin: 435, sleepConfidence: 0.8 });
  });

  it("is more confident when the phone was still and charging", async () => {
    await ingestBatch(db(), [
      ...night(),
      activity("2026-09-26T21:50:00Z", "still", "enter"),
      activity("2026-09-27T05:12:00Z", "still", "exit"),
      heartbeat("2026-09-27T00:00:00Z", true),
    ]);
    expect((await estimate())?.confidence).toBe(1);
  });

  it("falls back to the last unlock without screen events (Phase 1 app)", async () => {
    await ingestBatch(
      db(),
      night().filter((e) => e.type === "unlock"),
    );
    expect(await estimate()).toMatchObject({
      sleepStart: new Date("2026-09-26T21:40:00Z"),
      durationMin: 450,
      confidence: 0.65,
    });
  });

  it("ignores a quick check in the middle of the night", async () => {
    await ingestBatch(db(), [
      ...night(),
      unlock("2026-09-27T01:00:00Z"), // 03:00 local
      screen("2026-09-27T01:03:00Z", "off"),
    ]);
    expect(await estimate()).toMatchObject({
      sleepStart: new Date("2026-09-26T21:55:00Z"),
      durationMin: 435,
    });
  });

  it("a longer session at night does split it (the longest stretch wins)", async () => {
    await ingestBatch(db(), [
      ...night(),
      unlock("2026-09-27T01:00:00Z"),
      unlock("2026-09-27T01:20:00Z"), // repeated use: really awake
      screen("2026-09-27T01:40:00Z", "off"),
    ]);
    expect(await estimate()).toMatchObject({
      sleepStart: new Date("2026-09-27T01:40:00Z"),
      wakeAt: new Date("2026-09-27T05:10:00Z"),
    });
  });

  it("needs a closing unlock and a quiet stretch of 3 hours", async () => {
    await ingestBatch(db(), night().slice(0, 3)); // still asleep: no wake unlock yet
    expect(await estimate()).toBeUndefined();

    await ingestBatch(db(), [unlock("2026-09-27T00:30:00Z")]); // only 2h50m quiet
    expect(await estimate()).toBeUndefined();
  });

  it("never overwrites a corrected estimate", async () => {
    await db()
      .insert(sleepEstimates)
      .values({
        date: "2026-09-27",
        sleepStart: new Date("2026-09-26T21:00:00Z"),
        wakeAt: new Date("2026-09-27T05:00:00Z"),
        durationMin: 480,
        confidence: 1,
        corrected: true,
      });
    await ingestBatch(db(), night());
    expect(await estimate()).toMatchObject({ durationMin: 480, corrected: true });
  });

  it("nightly rebuild and weekly prune run", async () => {
    const old = unlock("2026-01-01T08:00:00Z");
    await ingestBatch(db(), [old, unlock(new Date().toISOString().replace(/\.\d+Z$/, "Z"))]);
    await db().execute(sql`select public.nightly_rebuild()`);
    const pruned = await db().execute(sql`select public.prune_events() as n`);
    expect(Number((pruned as unknown as { n: number }[])[0]!.n)).toBe(1);
    expect(await db().select().from(events).where(eq(events.id, old.id))).toHaveLength(0);
  });
});
