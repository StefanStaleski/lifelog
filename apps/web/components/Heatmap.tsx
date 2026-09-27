const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Weekday × hour, one hue getting stronger with more phone use (a sequential ramp). */
export function Heatmap({ grid }: { grid: number[][] }) {
  const max = Math.max(1, ...grid.flat());
  const cell = 16;
  const left = 34;
  const top = 16;
  return (
    <div className="space-y-2">
      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${left + 24 * cell} ${top + 7 * cell}`}
          className="w-full max-w-3xl min-w-[420px]"
          role="img"
          aria-label="Phone use by weekday and hour"
        >
          {[0, 6, 12, 18].map((h) => (
            <text
              key={h}
              x={left + h * cell}
              y={10}
              className="fill-stone-500 font-mono text-[8px]"
            >
              {String(h).padStart(2, "0")}
            </text>
          ))}
          {grid.map((row, d) => (
            <g key={d}>
              <text
                x={0}
                y={top + d * cell + 11}
                className="fill-stone-400 font-mono text-[8px] uppercase"
              >
                {DAYS[d]}
              </text>
              {row.map((m, h) => (
                <rect
                  key={h}
                  x={left + h * cell + 1}
                  y={top + d * cell + 1}
                  width={cell - 2}
                  height={cell - 2}
                  rx={2}
                  fill="var(--series-1)"
                  opacity={m > 0 ? 0.12 + 0.88 * (m / max) : 0.04}
                >
                  <title>{`${DAYS[d]} ${String(h).padStart(2, "0")}:00 · ${Math.round(m)} min on phone (weekly average)`}</title>
                </rect>
              ))}
            </g>
          ))}
        </svg>
      </div>
      <p className="flex items-center gap-2 font-mono text-[10px] tracking-[0.15em] text-stone-500 uppercase">
        less
        {[0.12, 0.34, 0.56, 0.78, 1].map((o) => (
          <span
            key={o}
            className="size-3 rounded-sm bg-(--series-1)"
            style={{ opacity: o }}
            aria-hidden
          />
        ))}
        more · weekly average, last 4 weeks
      </p>
    </div>
  );
}
