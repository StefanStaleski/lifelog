import { randomUUID } from "node:crypto";
import {
  activitySegments,
  dailySummary,
  locationStays,
  places,
  screenEvents,
  sourceHealth,
  stepsHourly,
  visits,
} from "@lifelog/shared/db";
import { asc, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/lib/db";
import { resetDb, validFixtures } from "@/test/helpers";
import { ingestBatch } from "./ingest";

const fx = validFixtures();
const db = () => getDb();

beforeEach(resetDb);
afterAll(closeDb);

const ev = (type: string, occurred_at: string, payload: object, ended_at?: string) => ({
  id: randomUUID(),
  type,
  occurred_at,
  ...(ended_at ? { ended_at } : {}),
  device_id: "s24",
  payload,
});
const steps = (hour: string, n: number, m = n) =>
  ev(
    "steps",
    hour,
    { steps: n, distance_m: m },
    new Date(Date.parse(hour) + 3_600_000).toISOString(),
  );
const summary = async (date: string) =>
  (await db().select().from(dailySummary).where(eq(dailySummary.date, date)))[0];

async function addPlace(kind: "home" | "work" | "gym" | "other") {
  const [p] = await db()
    .insert(places)
    .values({ name: kind, kind, lat: 41.99, lng: 21.43, radiusM: 150 })
    .returning();
  return p!.id;
}
const fence = (placeId: string, at: string, transition: "enter" | "exit") =>
  ev("geofence", at, { place_id: placeId, transition });

describe("phase 2 processing", () => {
  it("accepts every valid fixture, including the new types", async () => {
    const res = await ingestBatch(db(), Object.values(fx));
    expect(res.rejected).toEqual([]);
  });

  it("keeps the larger step count when an hour is sent again, per local day", async () => {
    await ingestBatch(db(), [steps("2026-09-27T07:00:00Z", 900)]);
    await ingestBatch(db(), [
      steps("2026-09-27T07:00:00Z", 1500),
      steps("2026-09-27T21:00:00Z", 200),
    ]);
    await ingestBatch(db(), [steps("2026-09-27T22:00:00Z", 50)]); // 00:00 local on the 28th

    expect((await db().select().from(stepsHourly)).find((h) => h.steps === 1500)).toBeTruthy();
    expect(await summary("2026-09-27")).toMatchObject({ steps: 1700, distanceM: 1700 });
    expect(await summary("2026-09-28")).toMatchObject({ steps: 50 });
  });

  it("stores screen events and stays", async () => {
    await ingestBatch(db(), [
      ev("screen", "2026-09-26T22:48:05Z", { state: "off" }),
      ev("stay", "2026-09-27T12:00:00Z", { lat: 41.996, lng: 21.431 }, "2026-09-27T13:30:00Z"),
    ]);
    expect(await db().select().from(screenEvents)).toHaveLength(1);
    expect(await db().select().from(locationStays)).toEqual([
      expect.objectContaining({
        lat: 41.996,
        lng: 21.431,
        leftAt: new Date("2026-09-27T13:30:00Z"),
      }),
    ]);
    expect(await summary("2026-09-27")).toMatchObject({ otherPlacesMin: 90 });
  });

  it("builds activity segments, also when transitions arrive out of order", async () => {
    await ingestBatch(db(), [
      ev("activity", "2026-09-27T07:20:00Z", { activity: "walking", transition: "exit" }),
      ev("activity", "2026-09-27T07:20:00.500Z", { activity: "still", transition: "enter" }),
    ]);
    await ingestBatch(db(), [
      ev("activity", "2026-09-27T07:00:00Z", { activity: "walking", transition: "enter" }),
    ]);

    const rows = await db()
      .select()
      .from(activitySegments)
      .orderBy(asc(activitySegments.startedAt));
    expect(rows).toEqual([
      {
        startedAt: new Date("2026-09-27T07:00:00Z"),
        endedAt: new Date("2026-09-27T07:20:00Z"),
        kind: "walking",
      },
      { startedAt: new Date("2026-09-27T07:20:00.500Z"), endedAt: null, kind: "still" },
    ]);
  });

  it("turns geofence enter/exit into visits and minutes per place kind", async () => {
    const home = await addPlace("home");
    const work = await addPlace("work");
    await ingestBatch(db(), [
      fence(work, "2026-09-27T07:00:00Z", "enter"),
      fence(work, "2026-09-27T07:05:00Z", "enter"), // duplicate enter is ignored
      fence(work, "2026-09-27T08:30:00Z", "exit"),
      fence(home, "2026-09-27T16:00:00Z", "enter"),
    ]);
    expect(await db().select().from(visits).where(eq(visits.placeId, work))).toEqual([
      {
        placeId: work,
        arrivedAt: new Date("2026-09-27T07:00:00Z"),
        leftAt: new Date("2026-09-27T08:30:00Z"),
      },
    ]);
    expect(await db().select().from(visits).where(eq(visits.placeId, home))).toEqual([
      expect.objectContaining({ leftAt: null }),
    ]);

    // The exit arrives in a later batch and closes the open visit.
    await ingestBatch(db(), [fence(home, "2026-09-27T17:00:00Z", "exit")]);
    expect(await db().select().from(visits).where(eq(visits.placeId, home))).toEqual([
      expect.objectContaining({ leftAt: new Date("2026-09-27T17:00:00Z") }),
    ]);
    expect(await summary("2026-09-27")).toMatchObject({ workMin: 90, homeMin: 60, gymMin: null });
  });

  it("splits a visit across local midnight", async () => {
    const home = await addPlace("home");
    // 20:00Z = 22:00 local on the 27th, 06:00Z = 08:00 local on the 28th
    await ingestBatch(db(), [
      fence(home, "2026-09-27T20:00:00Z", "enter"),
      fence(home, "2026-09-28T06:00:00Z", "exit"),
    ]);
    expect(await summary("2026-09-27")).toMatchObject({ homeMin: 120 });
    expect(await summary("2026-09-28")).toMatchObject({ homeMin: 480 });
  });

  it("reports missing phase-2 permissions from the heartbeat, and old heartbeats still work", async () => {
    await ingestBatch(db(), [fx.heartbeat]); // Phase 1 app: no new fields
    const phase2 = {
      ...fx["heartbeat-phase2"],
      id: randomUUID(),
      occurred_at: "2026-09-27T10:00:00Z",
    };
    await ingestBatch(db(), [phase2]);
    const [hb] = await db().select().from(sourceHealth).where(eq(sourceHealth.source, "heartbeat"));
    expect(hb?.lastError).toBe("background location not allowed");
  });
});
