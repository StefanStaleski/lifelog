import { LOCAL_TIME_ZONE } from "@lifelog/shared";

/** 0 → "0 min", 45 → "45 min", 192 → "3 h 12 min". */
export function duration(min: number | null | undefined): string {
  if (min == null) return "–";
  const m = Math.round(min);
  const h = Math.floor(m / 60);
  if (h === 0) return `${m} min`;
  return m % 60 === 0 ? `${h} h` : `${h} h ${m % 60} min`;
}

export const count = (n: number | null | undefined) =>
  n == null ? "–" : Math.round(n).toLocaleString("en-GB");

export const km = (m: number | null | undefined) =>
  m == null ? "–" : `${(m / 1000).toFixed(1)} km`;

export const clock = (d: Date) =>
  d.toLocaleTimeString("en-GB", { timeZone: LOCAL_TIME_ZONE, hour: "2-digit", minute: "2-digit" });

export const longDate = (date: string) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

export const shortDate = (date: string) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });

export function relative(then: Date, now = new Date()): string {
  const min = Math.floor((now.getTime() - then.getTime()) / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  if (min < 24 * 60) return `${Math.floor(min / 60)} h ago`;
  const days = Math.floor(min / (24 * 60));
  return days === 1 ? "yesterday" : `${days} days ago`;
}

export function greeting(now = new Date()): string {
  const h = Number(
    now.toLocaleString("en-GB", { timeZone: LOCAL_TIME_ZONE, hour: "2-digit", hour12: false }),
  );
  if (h < 5) return "Good night";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

export const MOOD_EMOJI = ["", "😞", "😕", "😐", "🙂", "😄"] as const;
export const ENERGY_EMOJI = ["", "😩", "😴", "😐", "🔋", "⚡"] as const;
export const FOCUS_EMOJI = ["", "🌫️", "🌀", "😐", "🎯", "🧠"] as const;

/** Percent change vs a baseline, and whether that's good given which direction is better. */
export type Tone = "good" | "attention" | "neutral";

export function versus(
  value: number | null,
  mean: number | null | undefined,
  better: "up" | "down" | null,
): { pct: number; tone: Tone; text: string } | null {
  if (value == null || mean == null || mean === 0) return null;
  const pct = Math.round(((value - mean) / mean) * 100);
  if (Math.abs(pct) < 5) return { pct, tone: "neutral", text: "about usual" };
  const tone: Tone =
    better === null ? "neutral" : pct > 0 === (better === "up") ? "good" : "attention";
  return { pct, tone, text: `${pct > 0 ? "↑" : "↓"} ${Math.abs(pct)}% vs usual` };
}
