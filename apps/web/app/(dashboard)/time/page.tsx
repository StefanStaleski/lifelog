import Link from "next/link";
import { PlacesChart } from "@/components/PlacesChart";
import { PlacesEditor } from "@/components/PlacesEditor";
import { Bar } from "@/components/Stat";
import { Card, EmptyState } from "@/components/ui";
import { getDb } from "@/lib/db";
import { duration } from "@/lib/format";
import { addDays, todayLocal } from "@/lib/metrics";
import { listPlaces } from "@/lib/places";
import { getSuggestions } from "@/lib/suggestions";
import { getTimeBreakdown, PLACE_SERIES } from "@/lib/time";

export default async function TimePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const range = sp.r === "30" ? 30 : 7;
  const end = addDays(todayLocal(), -1);
  const from = addDays(end, -(range - 1));
  const db = getDb();
  const [t, places, suggestions] = await Promise.all([
    getTimeBreakdown(db, from, end),
    listPlaces(db),
    getSuggestions(db),
  ]);
  const tracked = t.placeAverages.some((p) => p.minPerDay > 0);
  const maxCat = Math.max(1, ...t.categories.map((c) => c.minPerDay));
  const maxApp = Math.max(1, ...t.apps.map((a) => a.minPerDay));

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Time</h1>
          <p className="mt-1 text-stone-500 dark:text-stone-400">
            Where your hours go, and what your phone time is spent on.
          </p>
        </div>
        <div className="inline-flex rounded-full bg-stone-200/60 p-1 dark:bg-stone-800">
          {[7, 30].map((r) => (
            <Link
              key={r}
              href={`/time?r=${r}`}
              aria-current={r === range ? "true" : undefined}
              className="rounded-full px-3.5 py-1.5 text-sm font-medium text-stone-600 aria-[current=true]:bg-white aria-[current=true]:text-stone-900 aria-[current=true]:shadow-sm dark:text-stone-300 dark:aria-[current=true]:bg-stone-950 dark:aria-[current=true]:text-white"
            >
              {r} days
            </Link>
          ))}
        </div>
      </header>

      <Card title="Where your hours go">
        {!tracked ? (
          <EmptyState emoji="🗺️" title="No places tracked yet.">
            Add home, work and the gym below. Time there is counted from then on.
          </EmptyState>
        ) : (
          <div className="space-y-5">
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {t.placeAverages.map((p) => (
                <li key={p.key} className="rounded-2xl bg-stone-50 p-3 dark:bg-stone-800/60">
                  <p className="flex items-center gap-2 text-sm text-stone-500 dark:text-stone-400">
                    <span
                      className="size-2.5 rounded-sm"
                      style={{ background: p.color }}
                      aria-hidden
                    />
                    {p.emoji} {p.label}
                  </p>
                  <p className="mt-1 text-xl font-semibold tabular-nums">{duration(p.minPerDay)}</p>
                  <p className="text-xs text-stone-500 dark:text-stone-400">a day on average</p>
                </li>
              ))}
            </ul>
            <PlacesChart days={t.placeDays} />
            <details className="text-sm">
              <summary className="cursor-pointer text-stone-500 dark:text-stone-400">
                Show as a table
              </summary>
              <table className="mt-2 w-full tabular-nums">
                <thead>
                  <tr className="text-left text-stone-500">
                    <th className="py-1 font-medium">Day</th>
                    {PLACE_SERIES.map((s) => (
                      <th key={s.key} className="py-1 font-medium">
                        {s.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[...t.placeDays].reverse().map((d) => (
                    <tr key={d.date} className="border-t border-stone-100 dark:border-stone-800">
                      <td className="py-1">{d.date.slice(5)}</td>
                      {PLACE_SERIES.map((s) => (
                        <td key={s.key} className="py-1">
                          {d[s.key] ? duration(d[s.key]) : "–"}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          </div>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Phone time by kind of app">
          {t.categories.length === 0 ? (
            <EmptyState emoji="📱" title="No screen time yet." />
          ) : (
            <ul className="space-y-3">
              {t.categories.map((c) => (
                <li key={c.label} className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="font-medium">{c.label}</span>
                    <span className="tabular-nums text-stone-500 dark:text-stone-400">
                      {duration(c.minPerDay)} a day
                    </span>
                  </div>
                  <Bar value={c.minPerDay} max={maxCat} />
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Top apps">
          {t.apps.length === 0 ? (
            <EmptyState emoji="📱" title="No screen time yet." />
          ) : (
            <ul className="space-y-3">
              {t.apps.map((a) => (
                <li key={a.label} className="space-y-1">
                  <div className="flex justify-between gap-2 text-sm">
                    <span>
                      <span className="font-medium">{a.label}</span>{" "}
                      <span className="text-stone-500 dark:text-stone-400">
                        · {a.category} · {a.launchesPerDay.toFixed(0)} opens a day
                      </span>
                    </span>
                    <span className="shrink-0 tabular-nums text-stone-500 dark:text-stone-400">
                      {duration(a.minPerDay)}
                    </span>
                  </div>
                  <Bar value={a.minPerDay} max={maxApp} />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card title="Your places">
        <PlacesEditor places={places} suggestions={suggestions} />
      </Card>
    </div>
  );
}
