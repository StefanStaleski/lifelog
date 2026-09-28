import { randomUUID } from "node:crypto";
import { IngestResponseSchema } from "@lifelog/shared";
import { events, sourceHealth } from "@lifelog/shared/db";
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/lib/db";
import { batchRequest, resetDb, validFixtures } from "@/test/helpers";
import { POST } from "./route";

const fx = validFixtures();
const all = Object.values(fx);

beforeEach(resetDb);
afterAll(closeDb);

async function post(body: unknown, opts?: Parameters<typeof batchRequest>[1]) {
  const res = await POST(batchRequest(body, opts));
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

describe("POST /api/v1/events/batch", () => {
  it("rejects requests without the device token", async () => {
    expect((await post({ events: all }, { token: null })).status).toBe(401);
    expect((await post({ events: all }, { token: "wrong" })).status).toBe(401);
    expect(await getDb().select().from(events)).toHaveLength(0);
  });

  it("stores every valid fixture and reports counts", async () => {
    const res = await post({ events: all });
    expect(res).toEqual({
      status: 200,
      body: { accepted: all.length, duplicates: 0, rejected: [] },
    });

    const [row] = await getDb()
      .select()
      .from(events)
      .where(eq(events.id, fx.app_usage!.id as string));
    expect(row).toMatchObject({
      type: "app_usage",
      occurredAt: new Date("2026-09-27T08:00:00Z"),
      endedAt: new Date("2026-09-27T08:30:00Z"),
      payload: fx.app_usage!.payload,
      deviceId: "s24",
    });
    expect(row?.processedAt).toBeInstanceOf(Date);
  });

  it("accepts gzip bodies", async () => {
    const res = await post({ events: [fx.unlock] }, { gzip: true });
    expect(res.body).toMatchObject({ accepted: 1, duplicates: 0 });
  });

  it("treats a re-sent batch as duplicates", async () => {
    await post({ events: all });
    const again = await post({ events: all });
    expect(again.body).toEqual({ accepted: 0, duplicates: all.length, rejected: [] });
    expect(await getDb().select().from(events)).toHaveLength(all.length);
  });

  it("counts a duplicate id inside one batch once", async () => {
    const res = await post({ events: [fx.unlock, fx.unlock] });
    expect(res.body).toMatchObject({ accepted: 1, duplicates: 1 });
  });

  it("rejects invalid events individually and keeps the rest", async () => {
    const bad = { ...fx.unlock, id: randomUUID(), occurred_at: "2026-09-27T08:00:00+02:00" };
    const res = await post({ events: [fx.checkin, bad, "garbage"] });
    expect(res.status).toBe(200);
    expect(IngestResponseSchema.safeParse(res.body).success).toBe(true);
    expect(res.body.accepted).toBe(1);
    expect(res.body.rejected).toEqual([
      { index: 1, id: bad.id, error: expect.stringMatching(/^occurred_at:/) },
      { index: 2, id: null, error: expect.any(String) },
    ]);

    const [ingest] = await getDb()
      .select()
      .from(sourceHealth)
      .where(eq(sourceHealth.source, "ingest"));
    expect(ingest?.lastError).toMatch(/^2 event\(s\) rejected/);
  });

  it("rejects empty, oversized and malformed batches", async () => {
    expect((await post({ events: [] })).status).toBe(400);
    expect((await post({ nope: 1 })).status).toBe(400);
    const tooMany = Array.from({ length: 501 }, () => fx.unlock);
    expect((await post({ events: tooMany })).status).toBe(413);
  });

  it("accepts only desktop events with the desktop token", async () => {
    const res = await post(
      { events: [fx.desktop_usage, fx.unlock, fx.desktop_heartbeat, fx.call] },
      { token: "test-desktop-token" },
    );
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      accepted: 2,
      duplicates: 0,
      rejected: [
        { index: 1, id: fx.unlock!.id, error: 'type: "unlock" is not accepted with this token' },
        { index: 3, id: fx.call!.id, error: 'type: "call" is not accepted with this token' },
      ],
    });
    const stored = await getDb().select({ type: events.type }).from(events);
    expect(stored.map((e) => e.type).sort()).toEqual(["desktop_heartbeat", "desktop_usage"]);
  });

  it("rejects the desktop token when DESKTOP_TOKEN is unset", async () => {
    const saved = process.env.DESKTOP_TOKEN;
    delete process.env.DESKTOP_TOKEN;
    try {
      const res = await post({ events: [fx.desktop_usage] }, { token: "test-desktop-token" });
      expect(res.status).toBe(401);
    } finally {
      process.env.DESKTOP_TOKEN = saved;
    }
  });

  it("tracks the latest event per source without moving backwards", async () => {
    const later = { ...fx.unlock, id: randomUUID(), occurred_at: "2026-09-28T07:00:00Z" };
    await post({ events: [later] });
    await post({ events: [fx.unlock] }); // older unlock arrives late

    const [unlock] = await getDb()
      .select()
      .from(sourceHealth)
      .where(eq(sourceHealth.source, "unlock"));
    expect(unlock?.lastEventAt).toEqual(new Date("2026-09-28T07:00:00Z"));
  });
});
