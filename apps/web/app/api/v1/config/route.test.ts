import { ConfigResponseSchema } from "@lifelog/shared";
import { describe, expect, it } from "vitest";
import { GET } from "./route";

const get = (token?: string) =>
  GET(
    new Request("http://localhost/api/v1/config", {
      headers: token ? { authorization: `Bearer ${token}` } : {},
    }),
  );

describe("GET /api/v1/config", () => {
  it("requires the device token", () => {
    expect(get().status).toBe(401);
  });

  it("returns a contract-valid config", async () => {
    const res = get("test-device-token");
    expect(res.status).toBe(200);
    const body = ConfigResponseSchema.parse(await res.json());
    expect(body).toMatchObject({ collection_interval_min: 30, upload_batch_size: 500, places: [] });
  });
});
