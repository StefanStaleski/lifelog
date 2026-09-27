import Link from "next/link";
import { TrendChart } from "@/components/TrendChart";
import { Chip } from "@/components/Stat";
import { Card, EmptyState } from "@/components/ui";
import { getDb } from "@/lib/db";
import { count, duration, km, shortDate, versus } from "@/lib/format";
import {
  addDays,
  baselineOf,
  getDays,
  isMetricName,
  METRIC_NAMES,
  METRICS,
  type MetricName,
  todayLocal,
} from "@/lib/metrics";
import { RANGES, type RangeDays, trendPoints, weekOverWeek } from "@/lib/trends";

const show = (m: MetricName, v: number | null) => {
  if (v == null) return "–";
  switch (METRICS[m].format) {
    case "duration":
      return duration(v);
    case "distance":
      return km(v);
    case "score":
      return v.toFixed(1);
    default:
      return count(v);
  }
};

export default async function TrendsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const metric: MetricName = sp.m && isMetricName(sp.m) ? sp.m : "screen_time_min";
  const range = (RANGES as readonly number[]).includes(Number(sp.r))
    ? (Number(sp.r) as RangeDays)
    : 30;
  const meta = METRICS[metric];

  // Finished days only: today is still in progress.
  const end = addDays(todayLocal(), -1);
  const from = addDays(end, -(range - 1));
  const days = await getDays(getDb(), addDays(from, -Math.max(range, 30) - 7), end);
  const points = trendPoints(days, metric, from, end);
  const inRange = points.map((p) => p.value);
  const period = baselineOf(inRange);
  const previous = baselineOf(
    days.filter((d) => d.date < from && d.date >= addDays(from, -range)).map((d) => d[metric]),
  );
  const usual = baselineOf(days.filter((d) => d.date >= addDays(end, -29)).map((d) => d[metric]));
  const band =
    usual && usual.n >= 7
      ? { low: Math.max(0, usual.mean - usual.sd), high: usual.mean + usual.sd }
      : null;

  const href = (m: MetricName, r: number) => `/trends?m=${m}&r=${r}`;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">Trends</h1>
        <p className="mt-1 text-stone-500 dark:text-stone-400">
          How each part of your day moves over time.
        </p>
      </header>

      <div className="space-y-3">
        <div
          className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1"
          role="tablist"
          aria-label="Metric"
        >
          {METRIC_NAMES.map((m) => (
            <Link
              key={m}
              href={href(m, range)}
              aria-current={m === metric ? "true" : undefined}
              className="shrink-0 rounded-full bg-white px-3.5 py-2 text-sm font-medium ring-1 ring-stone-200 transition hover:bg-stone-100 aria-[current=true]:bg-accent/15 aria-[current=true]:text-accent aria-[current=true]:ring-accent/50 dark:bg-stone-900 dark:ring-stone-800 dark:hover:bg-stone-800"
            >
              <span aria-hidden>{METRICS[m].emoji}</span> {METRICS[m].label}
            </Link>
          ))}
        </div>
        <div
          className="inline-flex rounded-full bg-stone-200/60 p-1 dark:bg-stone-800"
          role="tablist"
          aria-label="Range"
        >
          {RANGES.map((r) => (
            <Link
              key={r}
              href={href(metric, r)}
              aria-current={r === range ? "true" : undefined}
              className="rounded-full px-3.5 py-1.5 text-sm font-medium text-stone-600 aria-[current=true]:bg-accent/15 aria-[current=true]:text-accent dark:text-stone-300"
            >
              {r === 365 ? "1 year" : `${r} days`}
            </Link>
          ))}
        </div>
      </div>

      <Card
        title={`${meta.emoji} ${meta.label}`}
        action={
          period && (
            <span className="text-sm text-stone-500 dark:text-stone-400">
              {shortDate(from)} – {shortDate(end)}
            </span>
          )
        }
      >
        {!period ? (
          <EmptyState emoji={meta.emoji} title="No data for this period yet." />
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
              <div>
                <p className="text-sm text-stone-500 dark:text-stone-400">Daily average</p>
                <p className="text-4xl font-semibold tracking-tight tabular-nums">
                  {show(metric, period.mean)}
                </p>
              </div>
              {(() => {
                const v = versus(period.mean, previous?.mean, meta.better);
                return (
                  v && (
                    <Chip tone={v.tone}>
                      {v.text.replace(
                        "vs usual",
                        `vs previous ${range === 365 ? "year" : `${range} days`}`,
                      )}
                    </Chip>
                  )
                );
              })()}
            </div>
            <TrendChart points={points} unit={meta.format} band={band} />
            <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-stone-500 dark:text-stone-400">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-3 w-2 rounded-sm bg-(--series-1) opacity-45" aria-hidden /> each
                day
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-0.5 w-4 rounded bg-(--series-1)" aria-hidden /> 7-day average
              </span>
              {band && (
                <span className="inline-flex items-center gap-1.5">
                  <span
                    className="h-3 w-4 rounded-sm bg-(--viz-band) ring-1 ring-stone-300 dark:ring-stone-700"
                    aria-hidden
                  />{" "}
                  your usual range (last 30 days)
                </span>
              )}
            </p>
            <details className="text-sm">
              <summary className="cursor-pointer text-stone-500 dark:text-stone-400">
                Show as a table
              </summary>
              <table className="mt-2 w-full max-w-md tabular-nums">
                <thead>
                  <tr className="text-left text-stone-500">
                    <th className="py-1 font-medium">Day</th>
                    <th className="py-1 font-medium">{meta.label}</th>
                    <th className="py-1 font-medium">7-day avg</th>
                  </tr>
                </thead>
                <tbody>
                  {[...points].reverse().map((p) => (
                    <tr key={p.date} className="border-t border-stone-100 dark:border-stone-800">
                      <td className="py-1">{shortDate(p.date)}</td>
                      <td className="py-1">{show(metric, p.value)}</td>
                      <td className="py-1">{show(metric, p.avg7)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          </div>
        )}
      </Card>

      <Card title="This week vs last week">
        <ul className="divide-y divide-stone-100 dark:divide-stone-800">
          {METRIC_NAMES.map((m) => {
            const w = weekOverWeek(days, m, end);
            if (w.thisWeek == null) return null;
            const v = versus(w.thisWeek, w.lastWeek, METRICS[m].better);
            return (
              <li key={m}>
                <Link
                  href={href(m, range)}
                  className="flex items-center justify-between gap-3 py-3 hover:opacity-80"
                >
                  <span className="flex items-center gap-2">
                    <span aria-hidden>{METRICS[m].emoji}</span>
                    <span className="font-medium">{METRICS[m].label}</span>
                  </span>
                  <span className="flex items-center gap-3">
                    <span className="tabular-nums">{show(m, w.thisWeek)}</span>
                    {v && <Chip tone={v.tone}>{v.text.replace(" vs usual", "")}</Chip>}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
        <p className="mt-3 text-xs text-stone-500 dark:text-stone-400">
          Daily averages over the last 7 finished days.
        </p>
      </Card>
    </div>
  );
}
