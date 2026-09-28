import { type SQL, sql } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/lib/db";
import { METRIC_COLUMNS, METRIC_NAMES, type MetricName } from "@/lib/metrics";
import { DateArg, daysBetween, r1, WEEKDAYS } from "./tool";

/**
 * `query_days`: filter and group `daily_summary` rows. Everything the caller controls is either an
 * enum (metric names come from the metrics registry, so new metrics appear here automatically), or
 * a bound parameter. Column identifiers come from the Drizzle schema, never from input.
 */

const Metric = z.enum(METRIC_NAMES as [MetricName, ...MetricName[]]);
const OPS = { "<": sql`<`, "<=": sql`<=`, ">": sql`>`, ">=": sql`>=`, "=": sql`=` } as const;
const AGGS = ["avg", "sum", "min", "max", "count"] as const;
const GROUPS = ["none", "all", "weekday", "week", "month", "tag"] as const;
const Tag = z.string().trim().min(1).max(60);

export const QUERY_DAYS_MAX_DAYS = 800;

export const QueryDaysInput = z
  .object({
    from: DateArg.describe("First local date, inclusive (YYYY-MM-DD)."),
    to: DateArg.describe("Last local date, inclusive (YYYY-MM-DD)."),
    metrics: z
      .array(Metric)
      .min(1)
      .max(20)
      .describe("Metrics to return for day d (the filtered day)."),
    where: z
      .array(
        z.object({
          metric: Metric,
          op: z.enum(["<", "<=", ">", ">=", "="]),
          value: z.number(),
          on_lag_day: z
            .boolean()
            .optional()
            .describe("Test the metric on day d + lag_days instead of day d. Default false."),
        }),
      )
      .max(10)
      .optional()
      .describe(
        "Conditions that must all hold (AND). A day whose metric is null never matches a condition on it.",
      ),
    weekdays: z
      .array(z.enum(WEEKDAYS))
      .min(1)
      .max(7)
      .optional()
      .describe('Keep only these weekdays of day d, e.g. ["sat","sun"].'),
    tags: z
      .object({
        any: z.array(Tag).max(20).optional().describe("Check-in has at least one of these tags."),
        all: z.array(Tag).max(20).optional().describe("Check-in has all of these tags."),
        none: z
          .array(Tag)
          .max(20)
          .optional()
          .describe("Check-in has none of these tags (days without a check-in pass)."),
      })
      .optional()
      .describe("Filter on the evening check-in tags of day d."),
    group_by: z
      .enum(GROUPS)
      .optional()
      .describe(
        "none (default): one row per day. all: one row for the whole selection. weekday / week (ISO, starts Monday) / month: one row per group. tag: one row per check-in tag (a day with 3 tags counts in 3 groups; days without check-in are left out).",
      ),
    agg: z
      .enum(AGGS)
      .optional()
      .describe(
        "How to combine days within a group (ignored for group_by none). Default avg. count = days with a value for that metric. Nulls are ignored.",
      ),
    lag_days: z
      .int()
      .min(1)
      .max(30)
      .optional()
      .describe("Pair day d with day d + lag_days (e.g. 1 = the next day). Default 1."),
    lag_metrics: z
      .array(Metric)
      .max(20)
      .optional()
      .describe(
        "Metrics read from day d + lag_days, returned as <metric>_lag<N>d, e.g. sleep_min_lag1d.",
      ),
  })
  .refine((a) => a.from <= a.to, "from must not be after to")
  .refine(
    (a) => daysBetween(a.from, a.to) < QUERY_DAYS_MAX_DAYS,
    `at most ${QUERY_DAYS_MAX_DAYS} days`,
  );

export type QueryDaysArgs = z.infer<typeof QueryDaysInput>;

type Row = Record<string, string | number | null>;

const col = (table: "d" | "lagged", m: MetricName) =>
  sql`${sql.raw(table)}.${sql.identifier(METRIC_COLUMNS[m].name)}`;
const list = (xs: readonly (string | number)[]) =>
  sql.join(
    xs.map((x) => sql`${x}`),
    sql`, `,
  );
const textArray = (xs: string[]) => sql`array[${list(xs)}]::text[]`;

function aggregate(agg: (typeof AGGS)[number], expr: SQL): SQL {
  switch (agg) {
    case "avg":
      return sql`avg(${expr})::float8`;
    case "sum":
      return sql`sum(${expr})::float8`;
    case "min":
      return sql`min(${expr})::float8`;
    case "max":
      return sql`max(${expr})::float8`;
    case "count":
      return sql`count(${expr})::int`;
  }
}

const GROUP_KEY: Record<Exclude<(typeof GROUPS)[number], "none" | "all">, [string, SQL]> = {
  weekday: ["weekday", sql`extract(isodow from d.date)::int`],
  week: ["week_start", sql`date_trunc('week', d.date)::date::text`],
  month: ["month", sql`to_char(d.date, 'YYYY-MM')`],
  tag: ["tag", sql`t.tag`],
};

export async function queryDays(db: Db, args: QueryDaysArgs) {
  const groupBy = args.group_by ?? "none";
  const agg = args.agg ?? "avg";
  const lagDays = args.lag_days ?? 1;
  const lagMetrics = [...new Set(args.lag_metrics ?? [])];
  const metrics = [...new Set(args.metrics)];
  const needsLag = lagMetrics.length > 0 || (args.where ?? []).some((w) => w.on_lag_day);
  const lagName = (m: MetricName) => `${m}_lag${lagDays}d`;

  // Output columns: [name, per-day expression].
  const outputs: [string, SQL][] = [
    ...metrics.map((m): [string, SQL] => [m, col("d", m)]),
    ...lagMetrics.map((m): [string, SQL] => [lagName(m), col("lagged", m)]),
  ];

  const conditions: SQL[] = [sql`d.date >= ${args.from}::date`, sql`d.date <= ${args.to}::date`];
  for (const w of args.where ?? [])
    conditions.push(
      sql`${col(w.on_lag_day ? "lagged" : "d", w.metric)} ${OPS[w.op]} ${w.value}::float8`,
    );
  if (args.weekdays?.length)
    conditions.push(
      sql`extract(isodow from d.date)::int in (${list(args.weekdays.map((w) => WEEKDAYS.indexOf(w) + 1))})`,
    );
  const tags = args.tags ?? {};
  if (tags.any?.length) conditions.push(sql`coalesce(c.tags, '{}') && ${textArray(tags.any)}`);
  if (tags.all?.length) conditions.push(sql`coalesce(c.tags, '{}') @> ${textArray(tags.all)}`);
  if (tags.none?.length)
    conditions.push(sql`not (coalesce(c.tags, '{}') && ${textArray(tags.none)})`);

  const from = sql.join(
    [
      sql`daily_summary d left join checkins c on c.date = d.date`,
      needsLag
        ? sql`left join daily_summary lagged on lagged.date = d.date + ${lagDays}::int`
        : null,
      groupBy === "tag" ? sql`cross join lateral unnest(c.tags) as t(tag)` : null,
    ].filter((x): x is SQL => x !== null),
    sql` `,
  );
  const where = sql.join(conditions, sql` and `);

  let rows: Row[];
  if (groupBy === "none") {
    const select = sql.join(
      [
        sql`d.date::text as date`,
        sql`extract(isodow from d.date)::int as isodow`,
        ...outputs.map(([name, e]) => sql`${e}::float8 as ${sql.identifier(name)}`),
      ],
      sql`, `,
    );
    const res = await db.execute<Row>(
      sql`select ${select} from ${from} where ${where} order by d.date`,
    );
    rows = res.rows.map(({ isodow, ...r }) => ({
      date: r.date as string,
      weekday: WEEKDAYS[Number(isodow) - 1]!,
      ...Object.fromEntries(outputs.map(([name]) => [name, r1(r[name] as number | null)])),
    }));
  } else {
    const key = groupBy === "all" ? null : GROUP_KEY[groupBy];
    const select = sql.join(
      [
        key ? sql`${key[1]} as group_key` : sql`'all' as group_key`,
        sql`count(*)::int as n`,
        ...outputs.map(([name, e]) => sql`${aggregate(agg, e)} as ${sql.identifier(name)}`),
      ],
      sql`, `,
    );
    const res = await db.execute<Row>(
      sql`select ${select} from ${from} where ${where} group by 1 order by 1`,
    );
    rows = res.rows.map(({ group_key, n, ...r }) => ({
      ...(key
        ? {
            [key[0]]:
              groupBy === "weekday" ? WEEKDAYS[Number(group_key) - 1]! : (group_key as string),
          }
        : {}),
      n: Number(n),
      ...Object.fromEntries(outputs.map(([name]) => [name, r1(r[name] as number | null)])),
    }));
  }

  // Days that passed the filters (for group_by tag, each day once even if it has several tags).
  let nDays = rows.length;
  if (groupBy !== "none") {
    const res = await db.execute<{ n: number }>(
      sql`select count(distinct d.date)::int as n from ${from} where ${where}`,
    );
    nDays = Number(res.rows[0]?.n ?? 0);
  }
  return {
    from: args.from,
    to: args.to,
    group_by: groupBy,
    ...(groupBy === "none" ? {} : { agg }),
    ...(needsLag ? { lag_days: lagDays } : {}),
    n_days: nDays,
    rows,
  };
}
