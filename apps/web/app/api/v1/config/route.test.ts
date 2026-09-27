import { ConfigResponseSchema } from "@lifelog/shared";
import { places } from "@lifelog/shared/db";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/lib/db";
import { resetDb } from "@/test/helpers";
import { GET } from "./route";

const get = (token?: string) =>
  GET(
    new Request("http://localhost/api/v1/config", {
      headers: token ? { authorization: `Bearer ${token}` } : {},
    }),
  );

beforeEach(resetDb);
afterAll(closeDb);

describe("GET /api/v1/config", () => {
  it("requires the device token", async () => {
    expect((await get()).status).toBe(401);
  });

  it("returns a contract-valid config with the active places", async () => {
    await getDb()
      .insert(places)
      .values([
        { name: "Home", kind: "home", lat: 41.9981, lng: 21.4254, radiusM: 120 },
        { name: "Old gym", kind: "gym", lat: 42, lng: 21.4, radiusM: 100, archivedAt: new Date() },
      ]);
    const res = await get("test-device-token");
    expect(res.status).toBe(200);
    const body = ConfigResponseSchema.parse(await res.json());
    expect(body).toMatchObject({ collection_interval_min: 30, upload_batch_size: 500 });
    expect(body.places).toEqual([
      {
        id: expect.any(String),
        name: "Home",
        kind: "home",
        lat: 41.9981,
        lng: 21.4254,
        radius_m: 120,
      },
    ]);
  });
});
