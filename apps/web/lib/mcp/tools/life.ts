import { checkins, sleepEstimates } from "@lifelog/shared/db";
import { and, asc, desc, gte, lte } from "drizzle-orm";
import { z } from "zod";
import { getHealth } from "@/lib/health";
import { addDays, baselineOf, todayLocal } from "@/lib/metrics";
import { getTimeBreakdown } from "@/lib/time";
import { DateArg, defineTool, localClock, r1, rangeInput, resolveRange, weekdayOf } from "../tool";

export const getLastNight = defineTool({
  name: "get_last_night",
  title: "Last night's sleep",
  description: `The phone's sleep estimate for last night (no wearable: inferred from the last screen-off, a 3-hour+ gap without unlocks, stillness and overnight charging) and how it compares with the 30 nights before.
No arguments = the night that ended this morning; pass \`date\` (the local wake-up date) for another night.
Returns { date, sleep_start, sleep_start_local, wake_at, wake_local, duration_min, confidence (0-1; below 0.5 treat as a guess), corrected (true = the owner fixed it by hand), baseline_30d: { mean_min, sd_min, n_nights, mean_sleep_start_local }, vs_avg_min, vs_avg_pct }. Times: *_at are UTC ISO, *_local are HH:MM in Europe/Skopje.
If there is no estimate for that night yet, returns { date, sleep: null, latest_date } with the most recent night that has one.`,
  input: z.object({
    date: DateArg.optional().describe("Local wake-up date of the night. Default today."),
  }),
  async run({ date }, { db, now }) {
    const day = date ?? todayLocal(now);
    const rows = await db
      .select()
      .from(sleepEstimates)
      .where(and(gte(sleepEstimates.date, addDays(day, -30)), lte(sleepEstimates.date, day)))
      .orderBy(asc(sleepEstimates.date));
    const night = rows.find((r) => r.date === day);
    if (!night) {
      const [latest] = await db
        .select({ date: sleepEstimates.date })
        .from(sleepEstimates)
        .where(lte(sleepEstimates.date, day))
        .orderBy(desc(sleepEstimates.date))
        .limit(1);
      return { date: day, sleep: null, latest_date: latest?.date ?? null };
    }
    const history = rows.filter((r) => r.date < day);
    const base = baselineOf(history.map((r) => r.durationMin));
    // Mean bedtime as minutes from local noon, so 23:30 and 00:30 average to midnight.
    const bedMin = history.map((r) => {
      const [h, m] = localClock(r.sleepStart).split(":").map(Number);
      return (((h! * 60 + m! - 720) % 1440) + 1440) % 1440;
    });
    const bed = baselineOf(bedMin);
    const bedClock =
      bed &&
      (() => {
        const t = Math.round(bed.mean + 720) % 1440;
        return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
      })();
    const diff = base ? night.durationMin - base.mean : null;
    return {
      date: night.date,
      sleep_start: night.sleepStart.toISOString(),
      sleep_start_local: localClock(night.sleepStart),
      wake_at: night.wakeAt.toISOString(),
      wake_local: localClock(night.wakeAt),
      duration_min: night.durationMin,
      confidence: r1(night.confidence),
      corrected: night.corrected,
      baseline_30d: base
        ? {
            mean_min: r1(base.mean),
            sd_min: r1(base.sd),
            n_nights: base.n,
            mean_sleep_start_local: bedClock,
          }
        : null,
      vs_avg_min: r1(diff),
      vs_avg_pct: diff !== null && base?.mean ? Math.round((diff / base.mean) * 100) : null,
    };
  },
});

export const getTimeBreakdownTool = defineTool({
  name: "get_time_breakdown",
  title: "Where the time went",
  description: `How the days in a range were spent: minutes per day at each kind of place (home, work, gym, elsewhere; from geofenced visits and unnamed stays), phone screen time per app category, and the top 8 apps.
Default range: the last 7 days ending today (at most 92 days). All values are averages per day over the days in the range that have data.
Returns { from, to, n_days, places_min_per_day: { home_min, work_min, gym_min, other_places_min }, app_categories: [{ category, min_per_day }], top_apps: [{ app, category, min_per_day, launches_per_day }] }.`,
  input: rangeInput(92, "Defaults to 6 days before `to` (7 days)."),
  async run(args, { db, now }) {
    const { from, to } = resolveRange(args, todayLocal(now), 7);
    const t = await getTimeBreakdown(db, from, to);
    return {
      from,
      to,
      n_days: t.days,
      places_min_per_day: Object.fromEntries(t.placeAverages.map((p) => [p.key, r1(p.minPerDay)])),
      app_categories: t.categories.map((c) => ({
        category: c.label,
        min_per_day: r1(c.minPerDay),
      })),
      top_apps: t.apps.map((a) => ({
        app: a.label,
        category: a.category,
        min_per_day: r1(a.minPerDay),
        launches_per_day: r1(a.launchesPerDay),
      })),
    };
  },
});

export const getCheckins = defineTool({
  name: "get_checkins",
  title: "Evening check-ins",
  description: `The owner's evening check-ins (prompted at 21:30): mood, energy and focus on a 1-5 scale (5 = best), free tags (e.g. "gym", "sick", "social") and an optional short note written by the owner.
Default range: the last 14 days ending today (at most 366 days). Days without a check-in are simply absent.
Returns { from, to, n, averages: { mood, energy, focus }, tag_counts: { <tag>: days }, checkins: [{ date, weekday, mood, energy, focus, tags, note? }] } (newest first).`,
  input: rangeInput(366, "Defaults to 13 days before `to` (14 days)."),
  async run(args, { db, now }) {
    const { from, to } = resolveRange(args, todayLocal(now), 14);
    const rows = await db
      .select()
      .from(checkins)
      .where(and(gte(checkins.date, from), lte(checkins.date, to)))
      .orderBy(desc(checkins.date));
    const avg = (k: "mood" | "energy" | "focus") => r1(baselineOf(rows.map((r) => r[k]))?.mean);
    const tagCounts: Record<string, number> = {};
    for (const r of rows) for (const t of r.tags) tagCounts[t] = (tagCounts[t] ?? 0) + 1;
    return {
      from,
      to,
      n: rows.length,
      averages: { mood: avg("mood"), energy: avg("energy"), focus: avg("focus") },
      tag_counts: Object.fromEntries(Object.entries(tagCounts).sort((a, b) => b[1] - a[1])),
      checkins: rows.map((r) => ({
        date: r.date,
        weekday: weekdayOf(r.date),
        mood: r.mood,
        energy: r.energy,
        focus: r.focus,
        tags: r.tags,
        ...(r.note ? { note: r.note } : {}),
      })),
    };
  },
});

export const getDataHealth = defineTool({
  name: "get_data_health",
  title: "Data health",
  description: `Whether the phone's data sources are still reporting, so you can warn the owner before trusting a gap (e.g. "no steps since Tuesday" may mean a revoked permission, not a lazy day).
Returns { generated_at, all_ok, quiet_sources: [source], sources: [{ source, last_event_at (UTC), minutes_since, stale, stale_after_min, last_error? }], device: { app_version, battery_pct, charging, pending_count, <permission>_granted… } (the latest phone heartbeat) }.
A source is stale when it has been silent longer than its allowance (heartbeat 2 h, most others 24 h, check-in 48 h); stale_after_min is null for sources that may legitimately be quiet (e.g. geofences). Mention stale sources and errors briefly; say nothing when all_ok is true unless asked.`,
  input: z.object({}),
  async run(_args, { db, now }) {
    const h = await getHealth(db, now);
    const device = h.sources.find((s) => s.details)?.details ?? null;
    return {
      generated_at: h.generated_at,
      all_ok: h.sources.every((s) => !s.stale && !s.last_error),
      quiet_sources: h.sources.filter((s) => s.stale).map((s) => s.source),
      sources: h.sources.map((s) => ({
        source: s.source,
        last_event_at: s.last_event_at,
        minutes_since: Math.round((now.getTime() - Date.parse(s.last_event_at)) / 60_000),
        stale: s.stale,
        stale_after_min: s.stale_after_min,
        ...(s.last_error ? { last_error: s.last_error } : {}),
      })),
      // The latest heartbeat: app version, battery, upload queue and permission flags.
      device,
    };
  },
});
