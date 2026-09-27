import { describe, expect, it } from "vitest";
import { duration, greeting, relative, versus } from "./format";

describe("format", () => {
  it("durations", () => {
    expect(duration(0)).toBe("0 min");
    expect(duration(192)).toBe("3 h 12 min");
    expect(duration(180)).toBe("3 h");
    expect(duration(null)).toBe("–");
  });

  it("relative times", () => {
    const now = new Date("2026-09-27T12:00:00Z");
    expect(relative(new Date("2026-09-27T11:59:40Z"), now)).toBe("just now");
    expect(relative(new Date("2026-09-27T11:15:00Z"), now)).toBe("45 min ago");
    expect(relative(new Date("2026-09-26T10:00:00Z"), now)).toBe("yesterday");
  });

  it("greets by local time", () => {
    expect(greeting(new Date("2026-09-27T05:00:00Z"))).toBe("Good morning"); // 07:00 local
    expect(greeting(new Date("2026-09-27T17:30:00Z"))).toBe("Good evening"); // 19:30 local
  });

  it("compares against the baseline in the right direction", () => {
    expect(versus(120, 100, "down")).toEqual({
      pct: 20,
      tone: "attention",
      text: "↑ 20% vs usual",
    });
    expect(versus(120, 100, "up")).toMatchObject({ tone: "good" });
    expect(versus(102, 100, "up")).toMatchObject({ text: "about usual" });
    expect(versus(80, 100, null)).toMatchObject({ tone: "neutral", text: "↓ 20% vs usual" });
    expect(versus(null, 100, "up")).toBeNull();
  });
});
