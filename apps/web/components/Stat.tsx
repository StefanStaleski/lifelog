import type { ReactNode } from "react";

type Tone = "good" | "attention" | "neutral";

const toneClass: Record<Tone, string> = {
  good: "bg-good-soft text-good",
  attention: "bg-attention-soft text-attention",
  neutral: "bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300",
};

export function Chip({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${toneClass[tone]}`}
    >
      {children}
    </span>
  );
}

/** Emoji + label on top, one big number, and a line of context underneath. */
export function Stat({
  emoji,
  label,
  value,
  sub,
  chip,
  children,
}: {
  emoji: string;
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  chip?: { tone: Tone; text: string } | null;
  children?: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-stone-200/70 sm:p-6 dark:bg-stone-900 dark:ring-stone-800">
      <div className="flex items-center gap-2 text-sm font-medium text-stone-500 dark:text-stone-400">
        <span className="text-lg" aria-hidden>
          {emoji}
        </span>
        {label}
      </div>
      <div className="text-4xl font-semibold tracking-tight tabular-nums">{value}</div>
      {(sub || chip) && (
        <div className="flex flex-wrap items-center gap-2 text-sm text-stone-500 dark:text-stone-400">
          {chip && <Chip tone={chip.tone}>{chip.text}</Chip>}
          {sub}
        </div>
      )}
      {children}
    </section>
  );
}

/** A thin rounded bar, `value` out of `max`. */
export function Bar({
  value,
  max,
  className = "bg-accent",
}: {
  value: number;
  max: number;
  className?: string;
}) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-stone-100 dark:bg-stone-800">
      <div className={`h-full rounded-full ${className}`} style={{ width: `${pct}%` }} />
    </div>
  );
}
