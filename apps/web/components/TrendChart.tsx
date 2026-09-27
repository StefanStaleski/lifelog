"use client";

import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TrendPoint } from "@/lib/trends";

type Props = {
  points: TrendPoint[];
  /** Formats a value for the axis and tooltip (e.g. "3 h 12 min"). */
  unit: "duration" | "count" | "distance" | "score";
  band: { low: number; high: number } | null;
};

function fmt(v: number, unit: Props["unit"], short = false): string {
  if (unit === "duration") {
    const h = Math.floor(v / 60);
    const m = Math.round(v % 60);
    if (short) return h ? `${h}h` : `${m}m`;
    return h ? `${h} h ${m} min` : `${m} min`;
  }
  if (unit === "distance") return `${(v / 1000).toFixed(1)} km`;
  if (unit === "score") return v.toFixed(1);
  return short && v >= 1000
    ? `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k`
    : Math.round(v).toLocaleString("en-GB");
}

const dayLabel = (d: string, withWeekday = false) =>
  new Date(`${d}T12:00:00Z`).toLocaleDateString(
    "en-GB",
    withWeekday
      ? { weekday: "short", day: "numeric", month: "short" }
      : { day: "numeric", month: "short" },
  );

/** Daily values as thin bars, the 7-day average as a line, and "your usual" as a soft band. */
/** Whole-hour ticks for durations, so the axis reads 0h, 2h, 4h… instead of 7h, 5h, 2h. */
function hourTicks(points: TrendPoint[], band: Props["band"]): number[] {
  const max = Math.max(
    60,
    band?.high ?? 0,
    ...points.map((p) => Math.max(p.value ?? 0, p.avg7 ?? 0)),
  );
  const hours = Math.ceil(max / 60);
  const step = hours <= 4 ? 1 : hours <= 10 ? 2 : hours <= 24 ? 4 : 6;
  return Array.from({ length: Math.ceil(hours / step) + 1 }, (_, i) => i * step * 60);
}

export function TrendChart({ points, unit, band }: Props) {
  const many = points.length > 120;
  const ticks = unit === "duration" ? hourTicks(points, band) : undefined;
  return (
    // min-w-0: let the chart shrink to the card instead of pushing it wider on phones
    <div className="h-72 w-full min-w-0 sm:h-80">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
          data={points}
          margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
          barCategoryGap={many ? 0 : 2}
        >
          <CartesianGrid vertical={false} stroke="var(--viz-grid)" />
          {band && (
            <ReferenceArea
              y1={band.low}
              y2={band.high}
              fill="var(--viz-band)"
              fillOpacity={1}
              ifOverflow="extendDomain"
            />
          )}
          <XAxis
            dataKey="date"
            tickFormatter={(d: string) => dayLabel(d)}
            tick={{ fill: "var(--viz-text)", fontSize: 12 }}
            tickLine={false}
            axisLine={false}
            minTickGap={24}
          />
          <YAxis
            tickFormatter={(v: number) => fmt(v, unit, true)}
            tick={{ fill: "var(--viz-text)", fontSize: 12 }}
            tickLine={false}
            axisLine={false}
            width={44}
            ticks={ticks}
            domain={unit === "score" ? [0, 5] : ticks ? [0, ticks[ticks.length - 1]!] : [0, "auto"]}
          />
          <Tooltip
            cursor={{ fill: "var(--viz-grid)", fillOpacity: 0.5 }}
            content={({ active, payload }) => {
              const p = active ? (payload?.[0]?.payload as TrendPoint | undefined) : undefined;
              if (!p) return null;
              return (
                <div className="rounded-2xl bg-white px-3 py-2 text-sm shadow-lg ring-1 ring-stone-200 dark:bg-stone-800 dark:ring-stone-700">
                  <p className="font-medium">{dayLabel(p.date, true)}</p>
                  <p className="tabular-nums">{p.value == null ? "no data" : fmt(p.value, unit)}</p>
                  {p.avg7 != null && (
                    <p className="text-stone-500 tabular-nums dark:text-stone-400">
                      7-day avg {fmt(p.avg7, unit)}
                    </p>
                  )}
                </div>
              );
            }}
          />
          <Bar
            dataKey="value"
            fill="var(--series-1)"
            fillOpacity={0.6}
            radius={many ? 0 : [4, 4, 0, 0]}
            isAnimationActive={false}
          />
          <Line
            dataKey="avg7"
            stroke="var(--series-1)"
            strokeWidth={2}
            dot={false}
            connectNulls
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
