import { randomUUID } from "node:crypto";
import { dailySummary, places, visits } from "@lifelog/shared/db";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/lib/db";
import { resetDb } from "@/test/helpers";
import { getAnomalies, getDaySlots, getKnownPlaces, getPatternOfLife, getStatus } from "./dossier";
import { ingestBatch } from "./ingest";
import { addDays } from "./metrics";

beforeEach(resetDb);
afterAll(closeDb);

const now = new Date("2026-09-27T15:00:00Z"); // 17:00 local

describe("dossier", () => {
  it("status: current place from an open visit, last signal and battery from the heartbeat", async () => {
    const [home] = await getDb()
      .insert(places)
      .values({ name: "Home", kind: "home", lat: 42, lng: 21.4, radiusM: 120 })
      .returning();
    await getDb()
      .insert(visits)
      .values({ placeId: home!.id, arrivedAt: new Date("2026-09-27T13:10:00Z"), leftAt: null });
    await ingestBatch(getDb(), [
      {
        id: randomUUID(),
        type: "heartbeat",
        occurred_at: "2026-09-27T14:50:00Z",
        device_id: "SM-S921B",
        payload: {
          app_version: "0.3.0",
          pending_count: 0,
          collection_paused: false,
          usage_access_granted: true,
          battery_optimization_ignored: true,
          battery_pct: 58,
          charging: true,
        },
      },
    ]);
    const s = await getStatus(getDb(), now);
    expect(s).toMatchObject({
      place: { name: "Home", kind: "home" },
      device: "SM-S921B",
      battery: 58,
      charging: true,
    });
    expect(s.lastSignal).toEqual(new Date("2026-09-27T14:50:00Z"));
  });

  it("day slots: places, sleep and phone use per local half hour", async () => {
    const [work] = await getDb()
      .insert(places)
      .values({ name: "Office", kind: "work", lat: 42, lng: 21.4, radiusM: 150 })
      .returning();
    // 09:00–10:00 local at work
    await getDb()
      .insert(visits)
      .values({
        placeId: work!.id,
        arrivedAt: new Date("2026-09-27T07:00:00Z"),
        leftAt: new Date("2026-09-27T08:00:00Z"),
      });
    await ingestBatch(getDb(), [
      {
        id: randomUUID(),
        type: "app_usage",
        occurred_at: "2026-09-27T07:30:00Z",
        ended_at: "2026-09-27T08:00:00Z",
        device_id: "s24",
        payload: {
          package: "chat",
          app_label: "Chat",
          category: null,
          foreground_ms: 600_000,
          launches: 2,
        },
      },
    ]);
    const slots = await getDaySlots(getDb(), "2026-09-27");
    expect(slots).toHaveLength(48);
    expect(slots[18]).toEqual({ place: "work", asleep: false, phoneMin: 0 }); // 09:00
    expect(slots[19]).toEqual({ place: "work", asleep: false, phoneMin: 10 }); // 09:30
    expect(slots[20]!.place).toBeNull();
  });

  it("pattern of life: weekly average minutes by local weekday and hour", async () => {
    await ingestBatch(getDb(), [
      {
        id: randomUUID(),
        type: "app_usage",
        occurred_at: "2026-09-26T18:00:00Z", // Saturday 20:00 local
        ended_at: "2026-09-26T18:30:00Z",
        device_id: "s24",
        payload: {
          package: "chat",
          app_label: "Chat",
          category: null,
          foreground_ms: 28 * 60_000,
          launches: 1,
        },
      },
    ]);
    const grid = await getPatternOfLife(getDb(), 28, now);
    expect(grid[5]![20]).toBeCloseTo(7); // 28 min over 4 weeks
  });

  it("anomalies: flags a finished day far from the last 30", async () => {
    const values = Array.from({ length: 30 }, (_, i) => ({
      date: addDays("2026-08-27", i),
      screenTimeMin: 100 + (i % 5) * 5,
    }));
    await getDb()
      .insert(dailySummary)
      .values([...values, { date: "2026-09-26", screenTimeMin: 260 }]);
    const a = await getAnomalies(getDb(), now);
    expect(a.map((x) => x.metric)).toEqual(["screen_time_min"]);
    expect(a[0]!.ratio).toBeGreaterThan(2);
  });

  it("known places: visits and time in the last 30 days", async () => {
    const [gym] = await getDb()
      .insert(places)
      .values({ name: "Gym", kind: "gym", lat: 42, lng: 21.4, radiusM: 100 })
      .returning();
    await getDb()
      .insert(visits)
      .values([
        {
          placeId: gym!.id,
          arrivedAt: new Date("2026-09-25T16:00:00Z"),
          leftAt: new Date("2026-09-25T17:00:00Z"),
        },
        {
          placeId: gym!.id,
          arrivedAt: new Date("2026-06-01T16:00:00Z"),
          leftAt: new Date("2026-06-01T17:00:00Z"),
        },
      ]);
    const [k] = await getKnownPlaces(getDb(), now);
    expect(k).toMatchObject({ name: "Gym", visits: 1 });
    expect(k!.minutes).toBeCloseTo(60);
  });
});
