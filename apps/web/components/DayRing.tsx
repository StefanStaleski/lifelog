import type { Slot } from "@/lib/dossier";

const PLACE_COLOR = {
  home: "var(--series-1)",
  work: "var(--series-2)",
  gym: "var(--series-3)",
  other: "var(--series-4)",
} as const;
const PLACE_LABEL = { home: "Home", work: "Work", gym: "Gym", other: "Elsewhere" } as const;
const SLEEP = "#9085e9"; // dataviz reference slot 7 (dark step)

function arc(cx: number, cy: number, r: number, from: number, to: number) {
  const p = (a: number) => [cx + r * Math.sin(a), cy - r * Math.cos(a)] as const;
  const [x1, y1] = p(from);
  const [x2, y2] = p(to);
  return `M ${x1} ${y1} A ${r} ${r} 0 ${to - from > Math.PI ? 1 : 0} 1 ${x2} ${y2}`;
}

const time = (i: number) => `${String(Math.floor(i / 2)).padStart(2, "0")}:${i % 2 ? "30" : "00"}`;

/**
 * 24 hours as a clock (midnight at the top). Outer ring: where you were. Middle: asleep.
 * Inner: phone use per half hour (brighter = more). A needle marks now.
 */
export function DayRing({
  slots,
  nowFraction,
  center,
}: {
  slots: Slot[];
  nowFraction: number | null;
  center: { value: string; label: string };
}) {
  const S = 320;
  const c = S / 2;
  const seg = (2 * Math.PI) / 48;
  const gap = 0.012;
  return (
    <svg
      viewBox={`0 0 ${S} ${S}`}
      className="mx-auto w-full max-w-[340px]"
      role="img"
      aria-label="Your day as a 24-hour ring"
    >
      {[0, 6, 12, 18].map((h) => {
        const a = (h / 24) * 2 * Math.PI;
        return (
          <text
            key={h}
            x={c + 152 * Math.sin(a)}
            y={c - 152 * Math.cos(a) + 4}
            textAnchor="middle"
            className="fill-stone-500 font-mono text-[10px]"
          >
            {String(h).padStart(2, "0")}
          </text>
        );
      })}
      {slots.map((s, i) => {
        const from = i * seg + gap;
        const to = (i + 1) * seg - gap;
        const label = `${time(i)}–${time(i + 1)} · ${s.place ? PLACE_LABEL[s.place] : "unknown place"}${s.asleep ? " · asleep" : ""} · ${Math.round(s.phoneMin)} min on phone`;
        return (
          <g key={i}>
            <title>{label}</title>
            <path
              d={arc(c, c, 132, from, to)}
              stroke={s.place ? PLACE_COLOR[s.place] : "var(--viz-grid)"}
              strokeWidth={18}
              fill="none"
            />
            <path
              d={arc(c, c, 111, from, to)}
              stroke={s.asleep ? SLEEP : "var(--viz-grid)"}
              strokeWidth={10}
              fill="none"
              opacity={s.asleep ? 1 : 0.6}
            />
            <path
              d={arc(c, c, 94, from, to)}
              stroke="var(--series-1)"
              strokeWidth={12}
              fill="none"
              opacity={s.phoneMin > 0 ? 0.25 + 0.75 * Math.min(1, s.phoneMin / 20) : 0.06}
            />
          </g>
        );
      })}
      {nowFraction !== null && (
        <line
          x1={c}
          y1={c}
          x2={c + 146 * Math.sin(nowFraction * 2 * Math.PI)}
          y2={c - 146 * Math.cos(nowFraction * 2 * Math.PI)}
          stroke="var(--color-accent)"
          strokeWidth={1.5}
          strokeDasharray="3 3"
        />
      )}
      <circle cx={c} cy={c} r={74} className="fill-stone-950/80 stroke-accent/20" />
      <text
        x={c}
        y={c - 4}
        textAnchor="middle"
        className="fill-stone-100 text-[22px] font-semibold"
      >
        {center.value}
      </text>
      <text
        x={c}
        y={c + 16}
        textAnchor="middle"
        className="fill-accent font-mono text-[9px] tracking-[0.2em] uppercase"
      >
        {center.label}
      </text>
    </svg>
  );
}

export function DayRingLegend() {
  const item = (color: string, text: string) => (
    <span className="inline-flex items-center gap-1.5">
      <span className="size-2.5 rounded-sm" style={{ background: color }} aria-hidden />
      {text}
    </span>
  );
  return (
    <p className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-stone-400">
      {item(PLACE_COLOR.home, "Home")}
      {item(PLACE_COLOR.work, "Work")}
      {item(PLACE_COLOR.gym, "Gym")}
      {item(PLACE_COLOR.other, "Elsewhere")}
      {item(SLEEP, "Asleep")}
      {item("var(--series-1)", "Phone use (inner ring, brighter = more)")}
    </p>
  );
}
