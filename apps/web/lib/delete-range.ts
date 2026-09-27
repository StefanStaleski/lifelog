import { sql } from "drizzle-orm";
import type { Db } from "./db";

/**
 * The kill switch: removes everything recorded on local dates [from, to], raw events and all derived
 * rows. Named places themselves are kept. Returns rows deleted per table.
 */
export async function deleteRange(
  db: Db,
  from: string,
  to: string,
): Promise<Record<string, number>> {
  const inRange = (col: string) =>
    sql`public.local_date(${sql.identifier(col)}) BETWEEN ${from}::date AND ${to}::date`;
  const dateRange = sql`date BETWEEN ${from}::date AND ${to}::date`;
  const targets: [string, ReturnType<typeof sql>][] = [
    ["events", inRange("occurred_at")],
    ["unlocks", inRange("occurred_at")],
    ["screen_events", inRange("occurred_at")],
    ["location_stays", inRange("arrived_at")],
    ["visits", inRange("arrived_at")],
    ["activity_segments", inRange("started_at")],
    ["steps_hourly", inRange("hour")],
    ["app_usage", dateRange],
    ["checkins", dateRange],
    ["sleep_estimates", dateRange],
    ["daily_summary", dateRange],
  ];
  return db.transaction(async (tx) => {
    const counts: Record<string, number> = {};
    for (const [table, where] of targets) {
      const res = await tx.execute(sql`DELETE FROM ${sql.identifier(table)} WHERE ${where}`);
      counts[table] = (res as unknown as { count: number }).count ?? 0;
    }
    return counts;
  });
}
