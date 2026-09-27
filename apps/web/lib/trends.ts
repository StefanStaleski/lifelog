import { type DayRow, type MetricName, addDays, baselineOf } from "./metrics";

export const RANGES = [7, 30, 90, 365] as const;
export type RangeDays = (typeof RANGES)[number];

export type TrendPoint = { date: string; value: number | null; avg7: number | null };

/** Every date in [from, to] with its value (null when missing) and a trailing 7-day average. */
export function trendPoints(
  days: DayRow[],
  metric: MetricName,
  from: string,
  to: string,
): TrendPoint[] {
  const byDate = new Map(days.map((d) => [d.date, d[metric]]));
  const dates: string[] = [];
  for (let d = addDays(from, -6); d <= to; d = addDays(d, 1)) dates.push(d);
  const values = dates.map((d) => byDate.get(d) ?? null);
  return dates
    .map((date, i) => {
      const window = values.slice(Math.max(0, i - 6), i + 1).filter((v): v is number => v !== null);
      return {
        date,
        value: values[i]!,
        // Needs 4 of 7 days so a single day doesn't pose as a trend.
        avg7: window.length >= 4 ? window.reduce((a, b) => a + b, 0) / window.length : null,
      };
    })
    .filter((p) => p.date >= from);
}

/** Average of the 7 days ending `end` vs the 7 before. */
export function weekOverWeek(days: DayRow[], metric: MetricName, end: string) {
  const inRange = (a: string, b: string) =>
    days.filter((d) => d.date >= a && d.date <= b).map((d) => d[metric]);
  const thisWeek = baselineOf(inRange(addDays(end, -6), end));
  const lastWeek = baselineOf(inRange(addDays(end, -13), addDays(end, -7)));
  return { thisWeek: thisWeek?.mean ?? null, lastWeek: lastWeek?.mean ?? null };
}
