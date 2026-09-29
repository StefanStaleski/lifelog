import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { LIFELOG_DESKTOP_NAMESPACE, usageEventId, uuidv5 } from "../src/uuid";
import { VERSION } from "../src/version";

describe("uuidv5", () => {
  it("matches the RFC 4122 reference value", () => {
    // uuid5(NAMESPACE_DNS, "www.example.com") from Python's uuid module
    expect(uuidv5("www.example.com", "6ba7b810-9dad-11d1-80b4-00c04fd430c8")).toBe(
      "2ed6657d-e927-568b-95e1-2665a8aea6a2",
    );
  });

  it("is deterministic per (window, app, host) and version 5", () => {
    const a = usageEventId("2026-09-28T10:00:00.000Z", "code", null);
    expect(usageEventId("2026-09-28T10:00:00.000Z", "code", null)).toBe(a);
    expect(a).toBe(uuidv5("2026-09-28T10:00:00.000Z|code|", LIFELOG_DESKTOP_NAMESPACE));
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(usageEventId("2026-09-28T10:30:00.000Z", "code", null)).not.toBe(a);
    expect(usageEventId("2026-09-28T10:00:00.000Z", "firefox", "github.com")).not.toBe(
      usageEventId("2026-09-28T10:00:00.000Z", "firefox", null),
    );
  });
});

it("client version matches package.json", () => {
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  expect(VERSION).toBe(pkg.version);
});
