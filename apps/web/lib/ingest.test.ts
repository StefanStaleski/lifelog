import { randomUUID } from "node:crypto";
import {
  appUsage,
  checkins,
  dailySummary,
  events,
  sourceHealth,
  unlocks,
} from "@lifelog/shared/db";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/lib/db";
import { resetDb, validFixtures } from "@/test/helpers";
import { ingestBatch } from "./ingest";

const fx = validFixtures();
const db = () => getDb();

beforeEach(resetDb);
afterAll(closeDb);

const unlockAt = (occurred_at: string) => ({ ...fx.unlock, id: randomUUID(), occurred_at });

function usage(start: string, minutes: number, payload: Record<string, unknown>) {
  const end = new Date(Date.parse(start) + 30 * 60_000).toISOString();
  return {
    ...fx.app_usage,
    id: randomUUID(),
    occurred_at: start,
    ended_at: end,
    payload: { ...(fx.app_usage!.payload as object), foreground_ms: minutes * 60_000, ...payload },
  };
}

const summary = async (date: string) =>
  (await db().select().from(dailySummary).where(eq(dailySummary.date, date)))[0];

describe("event processing", () => {
  it("stores unlocks and summarises them per local day", async () => {
    await ingestBatch(db(), [
      unlockAt("2026-09-27T05:10:00Z"),
      unlockAt("2026-09-27T12:00:00Z"),
      unlockAt("2026-09-27T20:45:00Z"),
    ]);
    expect(await db().select().from(unlocks)).toHaveLength(3);
    expect(await summary("2026-09-27")).toMatchObject({
      unlocks: 3,
      firstUnlockAt: new Date("2026-09-27T05:10:00Z"),
      lastUnlockAt: new Date("2026-09-27T20:45:00Z"),
    });
  });

  it("splits days at local (Europe/Skopje) midnight, not UTC", async () => {
    // CEST (UTC+2): 21:59:59Z is still Sep 27 locally, 22:00Z is Sep 28.
    await ingestBatch(db(), [
      unlockAt("2026-09-27T21:59:59Z"),
      unlockAt("2026-09-27T22:00:00Z"),
      usage("2026-09-27T21:30:00Z", 10, {}),
      usage("2026-09-27T22:00:00Z", 20, {}),
    ]);
    expect(await summary("2026-09-27")).toMatchObject({ unlocks: 1, screenTimeMin: 10 });
    expect(await summary("2026-09-28")).toMatchObject({ unlocks: 1, screenTimeMin: 20 });
  });

  it("uses UTC+1 for the local day in winter", async () => {
    await ingestBatch(db(), [unlockAt("2026-01-15T22:59:59Z"), unlockAt("2026-01-15T23:00:00Z")]);
    expect(await summary("2026-01-15")).toMatchObject({ unlocks: 1 });
    expect(await summary("2026-01-16")).toMatchObject({ unlocks: 1 });
  });

  it("sums app usage per app per day across windows and batches", async () => {
    await ingestBatch(db(), [
      usage("2026-09-27T08:00:00Z", 12, { launches: 3 }),
      usage("2026-09-27T08:30:00Z", 5, { launches: 1 }),
    ]);
    await ingestBatch(db(), [
      usage("2026-09-27T12:00:00Z", 8, { launches: 2, app_label: "Chat (renamed)" }),
      usage("2026-09-27T12:00:00Z", 30, { package: "com.example.reader", app_label: "Reader" }),
    ]);

    const rows = await db().select().from(appUsage).orderBy(appUsage.package);
    expect(rows).toEqual([
      {
        date: "2026-09-27",
        package: "com.example.chat",
        appLabel: "Chat (renamed)",
        category: "social",
        foregroundMs: 25 * 60_000,
        launches: 6,
      },
      expect.objectContaining({ package: "com.example.reader", foregroundMs: 30 * 60_000 }),
    ]);
    expect(await summary("2026-09-27")).toMatchObject({ screenTimeMin: 55 });
  });

  it("does not double count when events are re-sent or reprocessed", async () => {
    const batch = [usage("2026-09-27T08:00:00Z", 12, {}), unlockAt("2026-09-27T08:05:00Z")];
    await ingestBatch(db(), batch);
    await ingestBatch(db(), batch);
    const ids = batch.map((e) => e.id);
    await db().execute(
      sql`select public.process_events(array[${sql.join(
        ids.map((id) => sql`${id}`),
        sql`, `,
      )}]::uuid[])`,
    );

    expect(await summary("2026-09-27")).toMatchObject({ screenTimeMin: 12, unlocks: 1 });
    const [row] = await db().select().from(appUsage);
    expect(row?.foregroundMs).toBe(12 * 60_000);
  });

  it("keeps the latest check-in per date, whatever order they arrive in", async () => {
    // Both fixtures are for 2026-09-27; the after-midnight one was submitted later.
    await ingestBatch(db(), [fx["checkin-after-midnight"]]);
    await ingestBatch(db(), [fx.checkin]);

    const rows = await db().select().from(checkins);
    expect(rows).toEqual([
      expect.objectContaining({ date: "2026-09-27", mood: 1, tags: [], note: null }),
    ]);
    expect(await summary("2026-09-27")).toMatchObject({ mood: 1, energy: 1, focus: 1 });
    expect(await summary("2026-09-28")).toBeUndefined();
  });

  it("stores check-in tags and note", async () => {
    await ingestBatch(db(), [fx.checkin]);
    const [row] = await db().select().from(checkins);
    expect(row).toMatchObject({
      mood: 4,
      energy: 3,
      focus: 5,
      tags: ["gym", "deep work"],
      note: "Good day, long walk after lunch.",
    });
  });

  it("reports device status from the newest heartbeat only", async () => {
    await ingestBatch(db(), [fx.heartbeat]);
    const older = {
      ...fx.heartbeat,
      id: randomUUID(),
      occurred_at: "2026-09-27T07:00:00Z",
      payload: { ...(fx.heartbeat!.payload as object), usage_access_granted: false },
    };
    await ingestBatch(db(), [older]);

    const [row] = await db()
      .select()
      .from(sourceHealth)
      .where(eq(sourceHealth.source, "heartbeat"));
    expect(row?.lastError).toBe("battery optimisation is on");
    expect(row?.details).toMatchObject({ pending_count: 12, usage_access_granted: true });
  });

  it("marks stored events as processed", async () => {
    await ingestBatch(db(), Object.values(fx));
    const unprocessed = await db()
      .select()
      .from(events)
      .where(sql`${events.processedAt} is null`);
    expect(unprocessed).toHaveLength(0);
  });
});
