import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ConfigResponseSchema, HealthResponseSchema, IngestResponseSchema } from "./api";

const load = (name: string): unknown =>
  JSON.parse(readFileSync(join(import.meta.dirname, "../fixtures/api", name), "utf8"));

describe("API response fixtures", () => {
  it.each([
    ["ingest-response.json", IngestResponseSchema],
    ["config-response.json", ConfigResponseSchema],
    ["health-response.json", HealthResponseSchema],
  ] as const)("%s matches its schema", (name, schema) => {
    expect(schema.safeParse(load(name)).error?.issues).toBeUndefined();
  });

  it("rejects an invalid check-in time", () => {
    const config = { ...(load("config-response.json") as object), checkin_time: "24:00" };
    expect(ConfigResponseSchema.safeParse(config).success).toBe(false);
  });
});
