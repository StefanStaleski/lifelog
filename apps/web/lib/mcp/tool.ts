import { LOCAL_TIME_ZONE } from "@lifelog/shared";
import { z } from "zod";
import type { Db } from "@/lib/db";
import { addDays } from "@/lib/metrics";

/** What every tool gets besides its arguments. `now` is injectable so tests can pin "today". */
export type ToolContext = { db: Db; now: Date };

/**
 * One MCP tool. `description` is what Claude reads to decide when and how to call it, so say what
 * it returns, the units, and the defaults. `run` returns plain JSON (units in field names); the
 * server serialises it.
 */
export type McpTool = {
  name: string;
  title: string;
  description: string;
  input: z.ZodObject;
  run: (args: unknown, ctx: ToolContext) => Promise<unknown>;
};

/** Typed helper: `run` sees the parsed input of `input`. */
export function defineTool<S extends z.ZodObject>(tool: {
  name: string;
  title: string;
  description: string;
  input: S;
  run: (args: z.infer<S>, ctx: ToolContext) => Promise<unknown>;
}): McpTool {
  return { ...tool, run: (args, ctx) => tool.run(args as z.infer<S>, ctx) };
}

export const DateArg = z.iso.date().describe("Local date (Europe/Skopje), YYYY-MM-DD");

/** Optional `from`/`to` with `from <= to` and at most `maxDays` days. */
export function rangeInput(maxDays: number, defaultNote: string) {
  return z
    .object({
      from: DateArg.optional().describe(`First local date, inclusive. ${defaultNote}`),
      to: DateArg.optional().describe("Last local date, inclusive. Defaults to today."),
    })
    .refine((a) => !a.from || !a.to || a.from <= a.to, "from must not be after to")
    .refine(
      (a) => !a.from || !a.to || daysBetween(a.from, a.to) < maxDays,
      `at most ${maxDays} days`,
    );
}

export const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);

/** Fills a missing `to` (today) and `from` (`to` minus `defaultDays - 1`). */
export function resolveRange(
  args: { from?: string | undefined; to?: string | undefined },
  today: string,
  defaultDays: number,
) {
  const to = args.to ?? today;
  const from = args.from ?? addDays(to, -(defaultDays - 1));
  return { from, to };
}

/** One decimal is plenty for averages; keeps the JSON short. */
export const r1 = (x: number | null | undefined) => (x == null ? null : Math.round(x * 10) / 10);

const WEEKDAY_NAMES = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export const WEEKDAYS = WEEKDAY_NAMES;
export type Weekday = (typeof WEEKDAY_NAMES)[number];
/** ISO weekday of a local date: "mon" … "sun". */
export const weekdayOf = (date: string): Weekday =>
  WEEKDAY_NAMES[(new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7]!;

/** "23:41" in Europe/Skopje. */
export const localClock = (d: Date) =>
  d.toLocaleTimeString("en-GB", { timeZone: LOCAL_TIME_ZONE, hour: "2-digit", minute: "2-digit" });

/** Drops null/undefined fields so rows only carry data that exists. */
export const compact = <T extends Record<string, unknown>>(o: T) =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v != null)) as Partial<T>;
