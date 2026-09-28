import { toLocalDate } from "@lifelog/shared";
import { dailySummary } from "@lifelog/shared/db";
import { and, asc, gte, lte, sql } from "drizzle-orm";
import type { Db } from "./db";

/**
 * Headline metrics from `daily_summary`. `better` says which direction is good, so the UI can
 * colour a change vs. the baseline; null means neither (e.g. time at home).
 */
export const METRICS = {
  screen_time_min: {
    label: "Screen time",
    unit: "min",
    format: "duration",
    better: "down",
    emoji: "📱",
  },
  unlocks: { label: "Unlocks", unit: "count", format: "count", better: "down", emoji: "🔓" },
  notifications: {
    label: "Notifications",
    unit: "count",
    format: "count",
    better: "down",
    emoji: "🔔",
  },
  steps: { label: "Steps", unit: "count", format: "count", better: "up", emoji: "👟" },
  distance_m: { label: "Distance", unit: "m", format: "distance", better: "up", emoji: "🗺️" },
  sleep_min: { label: "Sleep", unit: "min", format: "duration", better: "up", emoji: "😴" },
  mood: { label: "Mood", unit: "1-5", format: "score", better: "up", emoji: "🙂" },
  energy: { label: "Energy", unit: "1-5", format: "score", better: "up", emoji: "⚡" },
  focus: { label: "Focus", unit: "1-5", format: "score", better: "up", emoji: "🎯" },
  home_min: { label: "At home", unit: "min", format: "duration", better: null, emoji: "🏠" },
  work_min: { label: "At work", unit: "min", format: "duration", better: null, emoji: "💼" },
  gym_min: { label: "At the gym", unit: "min", format: "duration", better: "up", emoji: "🏋️" },
  other_places_min: {
    label: "Elsewhere",
    unit: "min",
    format: "duration",
    better: null,
    emoji: "📍",
  },
} as const;

export type MetricName = keyof typeof METRICS;
export const METRIC_NAMES = Object.keys(METRICS) as MetricName[];
export const isMetricName = (n: string): n is MetricName => n in METRICS;

/** The `daily_summary` column behind each metric (query_days and series read through this). */
export const METRIC_COLUMNS = {
  screen_time_min: dailySummary.screenTimeMin,
  unlocks: dailySummary.unlocks,
  notifications: dailySummary.notifications,
  steps: dailySummary.steps,
  distance_m: dailySummary.distanceM,
  sleep_min: dailySummary.sleepMin,
  mood: dailySummary.mood,
  energy: dailySummary.energy,
  focus: dailySummary.focus,
  home_min: dailySummary.homeMin,
  work_min: dailySummary.workMin,
  gym_min: dailySummary.gymMin,
  other_places_min: dailySummary.otherPlacesMin,
} satisfies Record<MetricName, unknown>;

export type DayRow = { date: string } & Record<MetricName, number | null>;
export type Baseline = { mean: number; sd: number; n: number };

/** YYYY-MM-DD arithmetic on calendar dates (no time zones involved). */
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export const todayLocal = (now = new Date()) => toLocalDate(now);

export function baselineOf(values: (number | null)[]): Baseline | null {
  const v = values.filter((x): x is number => x !== null);
  if (v.length === 0) return null;
  const mean = v.reduce((a, b) => a + b, 0) / v.length;
  const sd = Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / v.length);
  return { mean, sd, n: v.length };
}

export async function getDays(db: Db, from: string, to: string): Promise<DayRow[]> {
  const rows = await db
    .select()
    .from(dailySummary)
    .where(and(gte(dailySummary.date, from), lte(dailySummary.date, to)))
    .orderBy(asc(dailySummary.date));
  return rows.map((r) => ({
    date: r.date,
    screen_time_min: r.screenTimeMin,
    unlocks: r.unlocks,
    notifications: r.notifications,
    steps: r.steps,
    distance_m: r.distanceM,
    sleep_min: r.sleepMin,
    mood: r.mood,
    energy: r.energy,
    focus: r.focus,
    home_min: r.homeMin,
    work_min: r.workMin,
    gym_min: r.gymMin,
    other_places_min: r.otherPlacesMin,
  }));
}

/** Days in [from, to] plus each metric's baseline: mean and spread over the 30 days before `to`. */
export async function getSummary(db: Db, from: string, to: string) {
  const days = await getDays(db, from, to);
  const history = await getDays(db, addDays(to, -30), addDays(to, -1));
  const baseline = Object.fromEntries(
    METRIC_NAMES.map((m) => [m, baselineOf(history.map((d) => d[m]))]),
  ) as Record<MetricName, Baseline | null>;
  return { from, to, days, baseline };
}

export type Bucket = "day" | "week" | "month";

/** One metric as a series: the average per day within each bucket and how many days had data. */
export async function getSeries(
  db: Db,
  name: MetricName,
  from: string,
  to: string,
  bucket: Bucket,
) {
  const col = METRIC_COLUMNS[name];
  if (!["day", "week", "month"].includes(bucket)) throw new Error(`bad bucket ${bucket}`);
  // Inlined (from the allow-list above) so GROUP BY sees the same expression as SELECT.
  const start = sql`date_trunc(${sql.raw(`'${bucket}'`)}, ${dailySummary.date})::date`;
  const rows = await db
    .select({
      start: sql<string>`${start}::text`,
      avg: sql<number | null>`avg(${col})::float8`,
      n: sql<number>`count(${col})::int`,
    })
    .from(dailySummary)
    .where(and(gte(dailySummary.date, from), lte(dailySummary.date, to)))
    .groupBy(start)
    .orderBy(start);
  return { metric: name, bucket, from, to, points: rows.filter((r) => r.n > 0) };
}
