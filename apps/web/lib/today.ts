import { appUsage, checkins, sleepEstimates } from "@lifelog/shared/db";
import { desc, eq } from "drizzle-orm";
import type { Db } from "./db";
import { getHealth } from "./health";
import { addDays, getSummary, todayLocal } from "./metrics";

/** Everything the Today view shows, in one round of queries. */
export async function getToday(db: Db, now = new Date()) {
  const today = todayLocal(now);
  const yesterday = addDays(today, -1);
  const [summary, sleep, checkin, apps, health] = await Promise.all([
    getSummary(db, yesterday, today),
    db.select().from(sleepEstimates).where(eq(sleepEstimates.date, today)).limit(1),
    db.select().from(checkins).where(eq(checkins.date, today)).limit(1),
    db
      .select()
      .from(appUsage)
      .where(eq(appUsage.date, today))
      .orderBy(desc(appUsage.foregroundMs))
      .limit(5),
    getHealth(db, now),
  ]);
  const byDate = new Map(summary.days.map((d) => [d.date, d]));
  return {
    now,
    today,
    todayRow: byDate.get(today) ?? null,
    yesterdayRow: byDate.get(yesterday) ?? null,
    baseline: summary.baseline,
    sleep: sleep[0] ?? null,
    checkin: checkin[0] ?? null,
    topApps: apps.map((a) => ({
      label: a.appLabel,
      minutes: Math.round(a.foregroundMs / 60_000),
      category: a.category,
    })),
    health,
  };
}

export type TodayData = Awaited<ReturnType<typeof getToday>>;
