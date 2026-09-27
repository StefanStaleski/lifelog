import { appUsage, dailySummary } from "@lifelog/shared/db";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/lib/db";
import { resetDb } from "@/test/helpers";
import { categoryLabel, getTimeBreakdown } from "./time";

beforeEach(resetDb);
afterAll(closeDb);

describe("time breakdown", () => {
  it("averages places per day and folds unknown app categories into Other", async () => {
    const db = getDb();
    await db.insert(dailySummary).values([
      { date: "2026-09-25", homeMin: 600, workMin: 480 },
      { date: "2026-09-26", homeMin: 900, gymMin: 60 },
    ]);
    const row = (
      date: string,
      pkg: string,
      label: string,
      category: string | null,
      min: number,
    ) => ({
      date,
      package: pkg,
      appLabel: label,
      category,
      foregroundMs: min * 60_000,
      launches: 4,
    });
    await db
      .insert(appUsage)
      .values([
        row("2026-09-25", "a", "Chat", "social", 60),
        row("2026-09-26", "a", "Chat 2", "social", 40),
        row("2026-09-26", "b", "Browser", null, 20),
        row("2026-09-26", "c", "Odd", "weird", 10),
      ]);

    const t = await getTimeBreakdown(db, "2026-09-25", "2026-09-26");
    expect(t.placeAverages.map((p) => [p.label, p.minPerDay])).toEqual([
      ["Home", 750],
      ["Work", 240],
      ["Gym", 30],
      ["Elsewhere", 0],
    ]);
    expect(t.categories).toEqual([
      { label: "Social", minPerDay: 50 },
      { label: "Other", minPerDay: 15 },
    ]);
    expect(t.apps[0]).toEqual({
      label: "Chat 2",
      category: "Social",
      minPerDay: 50,
      launchesPerDay: 4,
    });
    expect(categoryLabel(null)).toBe("Other");
  });
});
