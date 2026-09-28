import { z } from "zod";
import {
  addDays,
  type Baseline,
  baselineOf,
  getDays,
  getSummary,
  METRIC_NAMES,
  METRICS,
  type MetricName,
  todayLocal,
} from "@/lib/metrics";
import { QueryDaysInput, queryDays } from "../query-days";
import { compact, DateArg, daysBetween, defineTool, r1, weekdayOf } from "../tool";

const Metric = z.enum(METRIC_NAMES as [MetricName, ...MetricName[]]);

/** "screen_time_min (min, lower is better)" for every metric: the legend the descriptions carry. */
const METRIC_LEGEND = METRIC_NAMES.map((m) => {
  const meta = METRICS[m];
  const better =
    meta.better === "up" ? ", higher is better" : meta.better === "down" ? ", lower is better" : "";
  return `${m} (${meta.label}; ${meta.unit}${better})`;
}).join(", ");

const baselineJson = (b: Baseline | null) =>
  b ? { mean: r1(b.mean), sd: r1(b.sd), n_days: b.n } : null;

export const getDailySummary = defineTool({
  name: "get_daily_summary",
  title: "Daily summary",
  description: `Headline metrics per local day (Europe/Skopje) from the phone, with a 30-day baseline for each metric.
Pass \`date\` for one day, or \`from\` and \`to\` for a range (at most 92 days); no arguments = today.
Returns { from, to, days: [{ date, weekday, <metric>: value, unusual: [...] }], baseline_30d: { <metric>: { mean, sd, n_days } } }.
The baseline covers the 30 days before \`to\` (not including it). A metric missing from a day means no data that day (today is still in progress, so its totals are partial).
\`unusual\` lists metrics at least 1.5 standard deviations from the baseline (needs 7+ baseline days), with the % difference.
Metrics: ${METRIC_LEGEND}. sleep_min on a date is the night that ended that morning.`,
  input: z
    .object({
      date: DateArg.optional().describe("One local date. Use instead of from/to."),
      from: DateArg.optional().describe("First local date of a range, inclusive."),
      to: DateArg.optional().describe("Last local date of a range, inclusive."),
    })
    .refine((a) => !(a.date && (a.from || a.to)), "pass either date or from/to")
    .refine((a) => !a.from === !a.to, "pass both from and to")
    .refine((a) => !a.from || !a.to || a.from <= a.to, "from must not be after to")
    .refine((a) => !a.from || !a.to || daysBetween(a.from, a.to) < 92, "at most 92 days"),
  async run(args, { db, now }) {
    const from = args.date ?? args.from ?? todayLocal(now);
    const to = args.date ?? args.to ?? from;
    const today = todayLocal(now);
    const s = await getSummary(db, from, to);
    return {
      from,
      to,
      days: s.days.map((d) => {
        const unusual = METRIC_NAMES.flatMap((m) => {
          const v = d[m];
          const b = s.baseline[m];
          // Today's totals are still growing; only last night's sleep is final.
          if (d.date >= today && m !== "sleep_min") return [];
          if (v == null || !b || b.n < 7 || b.sd === 0) return [];
          const z = (v - b.mean) / b.sd;
          if (Math.abs(z) < 1.5) return [];
          return [
            {
              metric: m,
              value: v,
              vs_baseline_pct: b.mean ? Math.round(((v - b.mean) / b.mean) * 100) : null,
              z: r1(z),
            },
          ];
        });
        const values = compact(Object.fromEntries(METRIC_NAMES.map((m) => [m, r1(d[m])])));
        return {
          date: d.date,
          weekday: weekdayOf(d.date),
          ...values,
          ...(unusual.length ? { unusual } : {}),
        };
      }),
      baseline_30d: compact(
        Object.fromEntries(METRIC_NAMES.map((m) => [m, baselineJson(s.baseline[m])])),
      ),
    };
  },
});

const PERIOD_DAYS = { week: 7, month: 30 } as const;

export const getTrend = defineTool({
  name: "get_trend",
  title: "Trend of one metric",
  description: `Compares one metric's daily average in the latest period with the period before it.
period "week" = the last 7 days vs the 7 before; "month" = the last 30 days vs the 30 before.
By default the latest period ends yesterday (the last finished day), or today for sleep_min (last night is already known); pass \`end\` to choose another last day.
Returns { metric, label, unit, better, period, current: { from, to, avg, n_days }, previous: { from, to, avg, n_days }, change, change_pct, verdict }.
avg is the mean over days that have data (n_days of them); verdict is "better", "worse", "about the same" (|change| < 5%), "changed" (for metrics where neither direction is better) or "not enough data".
Metrics: ${METRIC_LEGEND}.`,
  input: z.object({
    metric: Metric.describe("Metric name from daily_summary."),
    period: z.enum(["week", "month"]).optional().describe("Default week."),
    end: DateArg.optional().describe("Last day of the current period."),
  }),
  async run({ metric, period = "week", end }, { db, now }) {
    const today = todayLocal(now);
    const last = end ?? (metric === "sleep_min" ? today : addDays(today, -1));
    const n = PERIOD_DAYS[period];
    const curFrom = addDays(last, -(n - 1));
    const prevTo = addDays(curFrom, -1);
    const prevFrom = addDays(prevTo, -(n - 1));
    const days = await getDays(db, prevFrom, last);
    const avgOf = (a: string, b: string) =>
      baselineOf(days.filter((d) => d.date >= a && d.date <= b).map((d) => d[metric]));
    const cur = avgOf(curFrom, last);
    const prev = avgOf(prevFrom, prevTo);
    const change = cur && prev ? cur.mean - prev.mean : null;
    const pct = change !== null && prev && prev.mean !== 0 ? (change / prev.mean) * 100 : null;
    const meta = METRICS[metric];
    let verdict = "not enough data";
    if (change !== null) {
      if (pct !== null && Math.abs(pct) < 5) verdict = "about the same";
      else if (meta.better === null) verdict = "changed";
      else verdict = change > 0 === (meta.better === "up") ? "better" : "worse";
    }
    return {
      metric,
      label: meta.label,
      unit: meta.unit,
      better: meta.better,
      period,
      current: { from: curFrom, to: last, avg: r1(cur?.mean), n_days: cur?.n ?? 0 },
      previous: { from: prevFrom, to: prevTo, avg: r1(prev?.mean), n_days: prev?.n ?? 0 },
      change: r1(change),
      change_pct: pct === null ? null : Math.round(pct),
      verdict,
    };
  },
});

export const queryDaysTool = defineTool({
  name: "query_days",
  title: "Query days",
  description: `Flexible, read-only query over the daily metrics (one row per local day, Europe/Skopje) joined with the evening check-in tags. Use it to answer questions like "average sleep on days I went to the gym", "screen time by weekday", "mood in weeks where steps > 8000", or "sleep the night after a heavy screen-time day".
How it works: select days d in [from, to] (at most 800 days) → keep days where every \`where\` condition holds, the weekday is in \`weekdays\`, and the check-in tags match \`tags\` → return \`metrics\` of day d and \`lag_metrics\` of day d + lag_days (named <metric>_lag<N>d) → optionally group.
group_by: none (default) = one row per day { date, weekday, ... }; all = one row; weekday | week | month | tag = one row per group, combined with \`agg\` (avg default, sum, min, max, count). Each group row has n = number of days in it. Nulls (no data) are ignored by the aggregates and never pass a where condition.
Returns { from, to, group_by, agg?, lag_days?, n_days, rows }. Values are rounded to 1 decimal.
Lag example: "sleep after days with > 300 min screen time" = { metrics: ["screen_time_min"], where: [{ metric: "screen_time_min", op: ">", value: 300 }], lag_metrics: ["sleep_min"], lag_days: 1, group_by: "all" } (sleep_min on a date is the night that ended that morning, so the night after day d is sleep_min on d + 1).
Small n means weak evidence: say so, and don't present a difference as a cause.
Metrics: ${METRIC_LEGEND}.`,
  input: QueryDaysInput,
  run: (args, { db }) => queryDays(db, args),
});
