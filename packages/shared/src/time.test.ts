import { describe, expect, it } from "vitest";
import { toLocalDate } from "./time";

describe("toLocalDate", () => {
  it("rolls over to the next local day before UTC midnight (CEST, UTC+2)", () => {
    expect(toLocalDate(new Date("2026-07-01T21:59:59Z"))).toBe("2026-07-01");
    expect(toLocalDate(new Date("2026-07-01T22:00:00Z"))).toBe("2026-07-02");
  });

  it("uses UTC+1 in winter (CET)", () => {
    expect(toLocalDate(new Date("2026-01-15T22:59:59Z"))).toBe("2026-01-15");
    expect(toLocalDate(new Date("2026-01-15T23:00:00Z"))).toBe("2026-01-16");
  });
});
