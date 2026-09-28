import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";

const fixturesDir = join(import.meta.dirname, "../../../packages/shared/fixtures/events");

/** Valid contract fixtures keyed by file name (without .json). */
export function validFixtures(): Record<string, Record<string, unknown>> {
  const dir = join(fixturesDir, "valid");
  return Object.fromEntries(
    readdirSync(dir)
      .filter((f) => f.endsWith(".json"))
      .map((f) => [f.replace(/\.json$/, ""), JSON.parse(readFileSync(join(dir, f), "utf8"))]),
  );
}

/**
 * Empties every data table and puts the work schedule back to its defaults. `server_secrets`
 * (the contact salt) is never touched: it must not change.
 */
export async function resetDb(): Promise<void> {
  await getDb().execute(
    sql`truncate events, app_usage, unlocks, checkins, source_health, daily_summary, places, visits, location_stays, steps_hourly, activity_segments, screen_events, sleep_estimates, notifications_hourly, context_daily, dismissed_suggestions, portrait_frames, app_usage_windows, desktop_usage, calls, sms_messages, message_counts, people, app_tags`,
  );
  await getDb().execute(
    sql`update work_settings set days = default, start_local = default, end_local = default, untagged_desktop_is_work = default`,
  );
}

export function batchRequest(
  body: unknown,
  { token = "test-device-token", gzip = false }: { token?: string | null; gzip?: boolean } = {},
): Request {
  const json = JSON.stringify(body);
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token !== null) headers.authorization = `Bearer ${token}`;
  if (gzip) headers["content-encoding"] = "gzip";
  return new Request("http://localhost/api/v1/events/batch", {
    method: "POST",
    headers,
    body: gzip ? gzipSync(json) : json,
  });
}
