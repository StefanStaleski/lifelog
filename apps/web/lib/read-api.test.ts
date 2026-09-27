import { randomUUID } from "node:crypto";
import { dailySummary, events, places, unlocks } from "@lifelog/shared/db";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { DELETE as deleteData } from "@/app/api/v1/data/route";
import { GET as getMetric } from "@/app/api/v1/metrics/[name]/route";
import { PATCH as patchPlace } from "@/app/api/v1/places/[id]/route";
import { GET as listPlacesRoute, POST as createPlaceRoute } from "@/app/api/v1/places/route";
import { GET as getSummaryRoute } from "@/app/api/v1/summary/route";
import { getConfig } from "@/lib/config";
import { closeDb, getDb } from "@/lib/db";
import { resetDb } from "@/test/helpers";
import { ingestBatch } from "./ingest";
import { addDays, baselineOf, getSeries, getSummary } from "./metrics";

const db = () => getDb();
beforeEach(resetDb);
afterAll(closeDb);

const auth = { authorization: "Bearer test-device-token" };
const req = (path: string, init: RequestInit = {}, withAuth = true) =>
  new Request(`http://localhost${path}`, {
    ...init,
    headers: { ...(withAuth ? auth : {}), ...(init.headers ?? {}) },
  });

async function seedDays(
  from: string,
  n: number,
  f: (i: number) => Partial<typeof dailySummary.$inferInsert>,
) {
  await db()
    .insert(dailySummary)
    .values(Array.from({ length: n }, (_, i) => ({ date: addDays(from, i), ...f(i) })));
}

describe("metrics", () => {
  it("baseline is mean and spread of non-empty days", () => {
    expect(baselineOf([2, 4, null, 6])).toEqual({ mean: 4, sd: Math.sqrt(8 / 3), n: 3 });
    expect(baselineOf([null])).toBeNull();
  });

  it("summary returns the range and a 30-day baseline before `to`", async () => {
    // 40 days: screen time 100 for the first 30, then 200
    await seedDays("2026-08-19", 40, (i) => ({
      screenTimeMin: i < 30 ? 100 : 200,
      steps: i % 2 ? 5000 : null,
    }));
    const s = await getSummary(db(), "2026-09-25", "2026-09-27");
    expect(s.days.map((d) => d.date)).toEqual(["2026-09-25", "2026-09-26", "2026-09-27"]);
    expect(s.days[0]!.screen_time_min).toBe(200);
    // baseline window: 2026-08-28 .. 2026-09-26 = 21 days of 100 + 9 days of 200
    expect(s.baseline.screen_time_min!.n).toBe(30);
    expect(s.baseline.screen_time_min!.mean).toBeCloseTo((21 * 100 + 9 * 200) / 30);
    expect(s.baseline.steps!.mean).toBe(5000);
    expect(s.baseline.mood).toBeNull();
  });

  it("series averages per day within weeks and skips empty buckets", async () => {
    await seedDays("2026-09-14", 14, (i) => ({ steps: i < 7 ? 1000 * (i + 1) : null })); // Mon 14 .. Sun 27 Sep
    const s = await getSeries(db(), "steps", "2026-09-14", "2026-09-27", "week");
    expect(s.points).toEqual([{ start: "2026-09-14", avg: 4000, n: 7 }]);
  });
});

describe("dashboard read routes", () => {
  it("need the owner session or the device token", async () => {
    expect(
      (await getSummaryRoute(req("/api/v1/summary?from=2026-09-01&to=2026-09-02", {}, false)))
        .status,
    ).toBe(401);
    expect((await listPlacesRoute(req("/api/v1/places", {}, false))).status).toBe(401);
  });

  it("validate their parameters", async () => {
    expect(
      (await getSummaryRoute(req("/api/v1/summary?from=2026-09-05&to=2026-09-01"))).status,
    ).toBe(400);
    const params = (name: string) => ({ params: Promise.resolve({ name }) });
    expect(
      (await getMetric(req("/api/v1/metrics/nope?from=2026-09-01&to=2026-09-02"), params("nope")))
        .status,
    ).toBe(400);
    expect(
      (
        await getMetric(
          req("/api/v1/metrics/steps?from=2026-09-01&to=2026-09-02&bucket=year"),
          params("steps"),
        )
      ).status,
    ).toBe(400);
    expect(
      (await getMetric(req("/api/v1/metrics/steps?from=2026-09-01&to=2026-09-02"), params("steps")))
        .status,
    ).toBe(200);
  });

  it("create, rename and archive a place; config follows", async () => {
    const created = await createPlaceRoute(
      req("/api/v1/places", {
        method: "POST",
        body: JSON.stringify({ name: "Home", kind: "home", lat: 41.99, lng: 21.43, radius_m: 150 }),
      }),
    );
    expect(created.status).toBe(201);
    const home = (await created.json()) as { id: string };
    expect((await getConfig(db())).places.map((p) => p.name)).toEqual(["Home"]);

    const params = { params: Promise.resolve({ id: home.id }) };
    const renamed = await patchPlace(
      req(`/api/v1/places/${home.id}`, { method: "PATCH", body: JSON.stringify({ name: "Flat" }) }),
      params,
    );
    expect(await renamed.json()).toMatchObject({ name: "Flat", archived: false });

    await patchPlace(
      req(`/api/v1/places/${home.id}`, {
        method: "PATCH",
        body: JSON.stringify({ archived: true }),
      }),
      params,
    );
    expect((await getConfig(db())).places).toEqual([]);
    expect(
      ((await (await listPlacesRoute(req("/api/v1/places"))).json()) as { places: unknown[] })
        .places,
    ).toHaveLength(1);
  });

  it("reject invalid places", async () => {
    const bad = await createPlaceRoute(
      req("/api/v1/places", {
        method: "POST",
        body: JSON.stringify({ name: "X", kind: "castle", lat: 1, lng: 1, radius_m: 10 }),
      }),
    );
    expect(bad.status).toBe(400);
  });

  it("delete a date range only removes those local days", async () => {
    const unlock = (at: string) => ({
      id: randomUUID(),
      type: "unlock",
      occurred_at: at,
      device_id: "s24",
      payload: {},
    });
    // 21:59Z on the 26th is still the 26th locally; 22:00Z is the 27th.
    await ingestBatch(db(), [
      unlock("2026-09-26T21:59:00Z"),
      unlock("2026-09-27T08:00:00Z"),
      unlock("2026-09-28T08:00:00Z"),
    ]);
    await db().insert(places).values({ name: "Home", kind: "home", lat: 1, lng: 1, radiusM: 100 });

    expect(
      (await deleteData(req("/api/v1/data?from=2026-09-27&to=2026-09-27", { method: "DELETE" })))
        .status,
    ).toBe(400);
    const res = await deleteData(
      req("/api/v1/data?from=2026-09-27&to=2026-09-27&confirm=delete", { method: "DELETE" }),
    );
    expect(((await res.json()) as { deleted: Record<string, number> }).deleted).toMatchObject({
      events: 1,
      unlocks: 1,
      daily_summary: 1,
    });

    expect(await db().select().from(unlocks)).toHaveLength(2);
    expect(await db().select().from(events)).toHaveLength(2);
    expect(await db().select().from(places)).toHaveLength(1);
  });
});
