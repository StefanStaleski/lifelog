import { describe, expect, it } from "vitest";
import type { DayRow } from "./metrics";
import { trendPoints, weekOverWeek } from "./trends";

const day = (date: string, steps: number | null) => ({ date, steps }) as unknown as DayRow;

describe("trends", () => {
  it("fills missing dates and averages the trailing week (needs 4 days)", () => {
    const days = [
      day("2026-09-20", 1000),
      day("2026-09-21", 2000),
      day("2026-09-22", 3000),
      day("2026-09-24", 6000),
    ];
    const points = trendPoints(days, "steps", "2026-09-22", "2026-09-25");
    expect(points.map((p) => p.date)).toEqual([
      "2026-09-22",
      "2026-09-23",
      "2026-09-24",
      "2026-09-25",
    ]);
    expect(points[1]).toEqual({ date: "2026-09-23", value: null, avg7: null }); // only 3 days so far
    expect(points[2]!.avg7).toBe(3000); // (1000+2000+3000+6000)/4
  });

  it("compares the last 7 days with the 7 before", () => {
    const days = Array.from({ length: 14 }, (_, i) =>
      day(`2026-09-${String(14 + i).padStart(2, "0")}`, i < 7 ? 100 : 300),
    );
    expect(weekOverWeek(days, "steps", "2026-09-27")).toEqual({ thisWeek: 300, lastWeek: 100 });
  });
});
