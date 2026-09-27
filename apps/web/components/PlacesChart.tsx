"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { PLACE_SERIES, type PlaceDay } from "@/lib/time";

const hours = (m: number) =>
  m >= 60 ? `${Math.floor(m / 60)} h ${Math.round(m % 60)} min` : `${Math.round(m)} min`;
const day = (d: string, long = false) =>
  new Date(`${d}T12:00:00Z`).toLocaleDateString(
    "en-GB",
    long
      ? { weekday: "short", day: "numeric", month: "short" }
      : { day: "numeric", month: "short" },
  );

/** Hours per place kind for each day, stacked. A 2px surface gap separates segments. */
export function PlacesChart({ days }: { days: PlaceDay[] }) {
  return (
    <div className="h-72 w-full min-w-0">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={days}
          margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
          barCategoryGap={days.length > 20 ? 1 : 4}
        >
          <CartesianGrid vertical={false} stroke="var(--viz-grid)" />
          <XAxis
            dataKey="date"
            tickFormatter={(d: string) => day(d)}
            tick={{ fill: "var(--viz-text)", fontSize: 12 }}
            tickLine={false}
            axisLine={false}
            minTickGap={24}
          />
          <YAxis
            ticks={[0, 360, 720, 1080, 1440]}
            domain={[0, 1440]}
            tickFormatter={(v: number) => `${v / 60}h`}
            tick={{ fill: "var(--viz-text)", fontSize: 12 }}
            tickLine={false}
            axisLine={false}
            width={36}
          />
          <Tooltip
            cursor={{ fill: "var(--viz-grid)", fillOpacity: 0.5 }}
            content={({ active, payload }) => {
              const d = active ? (payload?.[0]?.payload as PlaceDay | undefined) : undefined;
              if (!d) return null;
              return (
                <div className="rounded-2xl bg-white px-3 py-2 text-sm shadow-lg ring-1 ring-stone-200 dark:bg-stone-800 dark:ring-stone-700">
                  <p className="mb-1 font-medium">{day(d.date, true)}</p>
                  {PLACE_SERIES.filter((s) => d[s.key] > 0).map((s) => (
                    <p key={s.key} className="flex items-center gap-2 tabular-nums">
                      <span
                        className="size-2.5 rounded-sm"
                        style={{ background: s.color }}
                        aria-hidden
                      />
                      {s.label} <span className="ml-auto pl-3">{hours(d[s.key])}</span>
                    </p>
                  ))}
                </div>
              );
            }}
          />
          {PLACE_SERIES.map((s, i) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              stackId="places"
              fill={s.color}
              stroke="var(--chart-surface)"
              strokeWidth={1}
              radius={i === PLACE_SERIES.length - 1 ? [4, 4, 0, 0] : 0}
              isAnimationActive={false}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
