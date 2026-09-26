import { describe, expect, it } from "vitest";
import { GET } from "./route";

describe("GET /api/v1/ping", () => {
  it("returns ok with a UTC timestamp", async () => {
    const res = GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; time: string };
    expect(body.ok).toBe(true);
    expect(body.time).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });
});
