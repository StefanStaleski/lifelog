import { appUsage } from "@lifelog/shared/db";
import { and, desc, gte, lte, sql } from "drizzle-orm";
import type { Db } from "./db";
import { getDays } from "./metrics";

export const PLACE_SERIES = [
  { key: "home_min", label: "Home", emoji: "🏠", color: "var(--series-1)" },
  { key: "work_min", label: "Work", emoji: "💼", color: "var(--series-2)" },
  { key: "gym_min", label: "Gym", emoji: "🏋️", color: "var(--series-3)" },
  { key: "other_places_min", label: "Elsewhere", emoji: "📍", color: "var(--series-4)" },
] as const;

export type PlaceDay = { date: string } & Record<(typeof PLACE_SERIES)[number]["key"], number>;

const CATEGORY_LABELS: Record<string, string> = {
  social: "Social",
  video: "Video",
  audio: "Music & audio",
  game: "Games",
  productivity: "Productivity",
  news: "News",
  maps: "Maps",
  image: "Photos",
  accessibility: "Accessibility",
};
export const categoryLabel = (c: string | null) => (c && CATEGORY_LABELS[c]) || "Other";

/** Hours per place kind per day, and screen time by app category and app, for [from, to]. */
export async function getTimeBreakdown(db: Db, from: string, to: string) {
  const days = await getDays(db, from, to);
  const placeDays: PlaceDay[] = days.map((d) => ({
    date: d.date,
    home_min: d.home_min ?? 0,
    work_min: d.work_min ?? 0,
    gym_min: d.gym_min ?? 0,
    other_places_min: d.other_places_min ?? 0,
  }));
  const n = Math.max(1, days.length);
  const placeAverages = PLACE_SERIES.map((s) => ({
    ...s,
    minPerDay: placeDays.reduce((a, d) => a + d[s.key], 0) / n,
  }));

  const inRange = and(gte(appUsage.date, from), lte(appUsage.date, to));
  const categories = await db
    .select({ category: appUsage.category, ms: sql<number>`sum(${appUsage.foregroundMs})::float8` })
    .from(appUsage)
    .where(inRange)
    .groupBy(appUsage.category)
    .orderBy(desc(sql`2`));
  const apps = await db
    .select({
      label: sql<string>`(array_agg(${appUsage.appLabel} ORDER BY ${appUsage.date} DESC))[1]`,
      category: sql<
        string | null
      >`(array_agg(${appUsage.category} ORDER BY ${appUsage.date} DESC))[1]`,
      ms: sql<number>`sum(${appUsage.foregroundMs})::float8`,
      launches: sql<number>`sum(${appUsage.launches})::int`,
    })
    .from(appUsage)
    .where(inRange)
    .groupBy(appUsage.package)
    .orderBy(desc(sql`3`))
    .limit(8);

  // Several null/unknown categories fold into one "Other" row.
  const byLabel = new Map<string, number>();
  for (const c of categories)
    byLabel.set(categoryLabel(c.category), (byLabel.get(categoryLabel(c.category)) ?? 0) + c.ms);
  return {
    days: n,
    placeDays,
    placeAverages,
    categories: [...byLabel]
      .map(([label, ms]) => ({ label, minPerDay: ms / 60_000 / n }))
      .sort((a, b) => b.minPerDay - a.minPerDay),
    apps: apps.map((a) => ({
      label: a.label,
      category: categoryLabel(a.category),
      minPerDay: a.ms / 60_000 / n,
      launchesPerDay: a.launches / n,
    })),
  };
}
