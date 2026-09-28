import { checkins, events, places, sleepEstimates, visits } from "@lifelog/shared/db";
import { and, desc, eq, gt, gte, isNull, lt, or, sql } from "drizzle-orm";
import type { Db } from "./db";
import {
  addDays,
  type Baseline,
  baselineOf,
  getDays,
  METRIC_NAMES,
  METRICS,
  type MetricName,
  todayLocal,
} from "./metrics";

const TZ = "Europe/Skopje";

/** Where the subject is now and what the phone last said. */
export async function getStatus(db: Db, now = new Date()) {
  const [open] = await db
    .select({ name: places.name, kind: places.kind, since: visits.arrivedAt })
    .from(visits)
    .innerJoin(places, eq(places.id, visits.placeId))
    .where(isNull(visits.leftAt))
    .orderBy(desc(visits.arrivedAt))
    .limit(1);
  const [beat] = await db
    .select({ at: events.occurredAt, payload: events.payload, device: events.deviceId })
    .from(events)
    .where(and(eq(events.type, "heartbeat"), sql`${events.deviceId} <> 'smoke-test'`))
    .orderBy(desc(events.occurredAt))
    .limit(1);
  const [first] = await db
    .select({ at: sql<Date>`min(${events.occurredAt})` })
    .from(events)
    .where(and(eq(events.type, "heartbeat"), sql`${events.deviceId} <> 'smoke-test'`));
  const p = (beat?.payload ?? {}) as Record<string, unknown>;
  return {
    place: open ? { name: open.name, kind: open.kind, since: open.since } : null,
    lastSignal: beat?.at ?? null,
    device: beat?.device ?? null,
    battery: typeof p.battery_pct === "number" ? p.battery_pct : null,
    charging: p.charging === true,
    appVersion: typeof p.app_version === "string" ? p.app_version : null,
    trackingSince: first?.at ? new Date(first.at) : null,
    now,
  };
}

export type Slot = {
  place: "home" | "work" | "gym" | "other" | null;
  asleep: boolean;
  phoneMin: number;
};

/**
 * The local day split into 48 half-hour slots: where the subject was, whether asleep, and phone
 * minutes. Built from visits, stays, the sleep estimate and app usage windows.
 */
export async function getDaySlots(db: Db, date: string): Promise<Slot[]> {
  const dayStart = sql`${date}::date::timestamp AT TIME ZONE ${TZ}`;
  const dayEnd = sql`(${date}::date + 1)::timestamp AT TIME ZONE ${TZ}`;
  const [row] = (await db.execute<{ start: Date }>(sql`select ${dayStart} as start`)).rows;
  const t0 = new Date(row!.start).getTime();
  const slots: Slot[] = Array.from({ length: 48 }, () => ({
    place: null,
    asleep: false,
    phoneMin: 0,
  }));
  const mark = (from: number, to: number, fn: (s: Slot) => void) => {
    for (let i = 0; i < 48; i++) {
      const a = t0 + i * 1_800_000;
      if (a + 1_800_000 > from && a < to) fn(slots[i]!);
    }
  };

  const vs = await db
    .select({ kind: places.kind, a: visits.arrivedAt, b: visits.leftAt })
    .from(visits)
    .innerJoin(places, eq(places.id, visits.placeId))
    .where(
      and(lt(visits.arrivedAt, dayEnd), or(isNull(visits.leftAt), gt(visits.leftAt, dayStart))),
    );
  for (const v of vs) mark(v.a.getTime(), (v.b ?? new Date()).getTime(), (s) => (s.place = v.kind));

  const stays = (
    await db.execute<{ a: Date; b: Date }>(
      sql`select arrived_at as a, left_at as b from location_stays where arrived_at < ${dayEnd} and left_at > ${dayStart}`,
    )
  ).rows;
  for (const s of stays)
    mark(new Date(s.a).getTime(), new Date(s.b).getTime(), (x) => (x.place ??= "other"));

  const sl = await db
    .select()
    .from(sleepEstimates)
    .where(or(eq(sleepEstimates.date, date), eq(sleepEstimates.date, addDays(date, 1))));
  for (const s of sl) mark(s.sleepStart.getTime(), s.wakeAt.getTime(), (x) => (x.asleep = true));

  const usage = await db
    .select({
      at: events.occurredAt,
      ms: sql<number>`sum((${events.payload} ->> 'foreground_ms')::bigint)::float8`,
    })
    .from(events)
    .where(
      and(
        eq(events.type, "app_usage"),
        gte(events.occurredAt, dayStart),
        lt(events.occurredAt, dayEnd),
      ),
    )
    .groupBy(events.occurredAt);
  for (const u of usage) {
    const i = Math.floor((u.at.getTime() - t0) / 1_800_000);
    if (i >= 0 && i < 48) slots[i]!.phoneMin += u.ms / 60_000;
  }
  return slots;
}

/** Phone minutes per weekday (0 = Mon) × hour over the last `days` days, averaged per week. */
export async function getPatternOfLife(db: Db, days = 28, now = new Date()) {
  const since = new Date(now.getTime() - days * 86_400_000);
  const { rows } = await db.execute<{ dow: number; hour: number; minutes: number }>(sql`
    select (extract(isodow from occurred_at at time zone ${TZ}) - 1)::int as dow,
           extract(hour from occurred_at at time zone ${TZ})::int as hour,
           sum((payload ->> 'foreground_ms')::bigint)::float8 / 60000 as minutes
    from events
    where type = 'app_usage' and occurred_at >= ${since.toISOString()}::timestamptz
    group by 1, 2`);
  const grid = Array.from({ length: 7 }, () => Array<number>(24).fill(0));
  const weeks = days / 7;
  for (const r of rows) grid[r.dow]![r.hour] = r.minutes / weeks;
  return grid;
}

/** Named places with how often and how long they were visited in the last 30 days. */
export async function getKnownPlaces(db: Db, now = new Date()) {
  const since = new Date(now.getTime() - 30 * 86_400_000);
  const { rows } = await db.execute<{
    id: string;
    name: string;
    kind: "home" | "work" | "gym" | "other";
    lat: number;
    lng: number;
    radius_m: number;
    visits: number;
    minutes: number;
    last_seen: Date | null;
  }>(sql`
    select p.id, p.name, p.kind, p.lat, p.lng, p.radius_m,
           count(v.arrived_at)::int as visits,
           coalesce(sum(extract(epoch from (coalesce(v.left_at, now()) - v.arrived_at)) / 60), 0)::float8 as minutes,
           max(coalesce(v.left_at, now())) as last_seen
    from places p
    left join visits v on v.place_id = p.id and v.arrived_at >= ${since.toISOString()}::timestamptz
    where p.archived_at is null
    group by p.id
    order by minutes desc`);
  return rows;
}

export type Anomaly = {
  metric: MetricName;
  date: string;
  value: number;
  baseline: Baseline;
  ratio: number;
  z: number;
};

/** Finished days (yesterday, and last night's sleep today) that sit far from the usual (|z| ≥ 1.5). */
export async function getAnomalies(db: Db, now = new Date()): Promise<Anomaly[]> {
  const today = todayLocal(now);
  const yesterday = addDays(today, -1);
  const days = await getDays(db, addDays(today, -31), today);
  const out: Anomaly[] = [];
  for (const m of METRIC_NAMES) {
    const date = m === "sleep_min" ? today : yesterday;
    const row = days.find((d) => d.date === date);
    const value = row?.[m];
    const history = days
      .filter((d) => d.date < date && d.date >= addDays(date, -30))
      .map((d) => d[m]);
    const base = baselineOf(history);
    if (value == null || !base || base.n < 7 || base.sd === 0) continue;
    const z = (value - base.mean) / base.sd;
    if (Math.abs(z) >= 1.5)
      out.push({
        metric: m,
        date,
        value,
        baseline: base,
        ratio: base.mean ? value / base.mean : 0,
        z,
      });
  }
  return out.sort((a, b) => Math.abs(b.z) - Math.abs(a.z));
}

export async function getFieldNotes(db: Db, limit = 8) {
  return db.select().from(checkins).orderBy(desc(checkins.date)).limit(limit);
}

/** The last 14 days of each metric, for sparklines. */
export async function getSparklines(db: Db, now = new Date()) {
  const today = todayLocal(now);
  const days = await getDays(db, addDays(today, -13), today);
  return Object.fromEntries(METRIC_NAMES.map((m) => [m, days.map((d) => d[m])])) as Record<
    MetricName,
    (number | null)[]
  >;
}

export const metricMeta = METRICS;
