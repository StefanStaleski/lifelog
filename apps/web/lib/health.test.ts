import { randomUUID } from "node:crypto";
import { HealthResponseSchema } from "@lifelog/shared";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { GET } from "@/app/api/v1/health/route";
import { closeDb, getDb } from "@/lib/db";
import { resetDb, validFixtures } from "@/test/helpers";
import { getHealth } from "./health";
import { ingestBatch } from "./ingest";

const fx = validFixtures();

beforeEach(resetDb);
afterAll(closeDb);

describe("getHealth", () => {
  it("is empty before any data arrives", async () => {
    expect((await getHealth(getDb())).sources).toEqual([]);
  });

  it("flags sources that went quiet longer than their allowance", async () => {
    // heartbeat fixture: 08:30:02Z; unlock fixture: 06:42:13Z
    await ingestBatch(getDb(), [fx.heartbeat, fx.unlock, "bad event"]);

    const at = async (iso: string) => {
      const health = await getHealth(getDb(), new Date(iso));
      return Object.fromEntries(health.sources.map((s) => [s.source, s.stale]));
    };
    expect(await at("2026-09-27T10:30:00Z")).toEqual({
      heartbeat: false,
      ingest: false,
      unlock: false,
    });
    expect(await at("2026-09-27T10:31:00Z")).toEqual({
      heartbeat: true,
      ingest: false,
      unlock: false,
    });
    expect(await at("2026-09-28T06:43:00Z")).toMatchObject({ unlock: true });
  });

  it("includes heartbeat details and warnings", async () => {
    await ingestBatch(getDb(), [fx.heartbeat]);
    const [hb] = (await getHealth(getDb())).sources;
    expect(hb).toMatchObject({
      source: "heartbeat",
      last_error: "battery optimisation is on",
      stale_after_min: 120,
      details: { pending_count: 12 },
    });
  });
});

describe("GET /api/v1/health", () => {
  it("requires the device token", async () => {
    expect((await GET(new Request("http://localhost/api/v1/health"))).status).toBe(401);
  });

  it("returns a contract-valid body", async () => {
    await ingestBatch(getDb(), [fx.heartbeat, { ...fx.unlock, id: randomUUID() }]);
    const res = await GET(
      new Request("http://localhost/api/v1/health", {
        headers: { authorization: "Bearer test-device-token" },
      }),
    );
    expect(res.status).toBe(200);
    const body = HealthResponseSchema.parse(await res.json());
    expect(body.sources.map((s) => s.source)).toEqual(["heartbeat", "unlock"]);
  });
});
