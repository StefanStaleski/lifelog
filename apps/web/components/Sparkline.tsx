/** A tiny trend line; the last point is marked. Gaps (no data) break the line. */
export function Sparkline({
  values,
  className = "",
}: {
  values: (number | null)[];
  className?: string;
}) {
  const W = 110;
  const H = 30;
  const nums = values.filter((v): v is number => v !== null);
  if (nums.length < 2) return <span className={`inline-block h-[30px] w-[110px] ${className}`} />;
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const x = (i: number) => (i / (values.length - 1)) * (W - 4) + 2;
  const y = (v: number) => H - 3 - ((v - min) / (max - min || 1)) * (H - 6);
  const parts: string[] = [];
  values.forEach((v, i) => {
    if (v === null) return;
    parts.push(
      `${i === 0 || values[i - 1] === null ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`,
    );
  });
  const last = values.length - 1 - [...values].reverse().findIndex((v) => v !== null);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={`h-[30px] w-[110px] ${className}`} aria-hidden>
      <path
        d={parts.join(" ")}
        fill="none"
        stroke="var(--series-1)"
        strokeWidth={2}
        strokeLinejoin="round"
      />
      <circle cx={x(last)} cy={y(values[last]!)} r={3} fill="var(--color-accent)" />
    </svg>
  );
}
