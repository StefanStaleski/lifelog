import { type GateResponse, SMOKE_TEST_DEVICE_ID, toLocalDate } from "@lifelog/shared";
import { checkins, dailySummary, events } from "@lifelog/shared/db";
import { and, asc, between, eq, gte, lte, min, ne } from "drizzle-orm";
import type { Db } from "./db";

/**
 * Longest allowed silence between heartbeats. Doze can hold background work for a few hours
 * overnight without losing data (usage is backfilled from UsageStats), so a gap means longer.
 */
export const MAX_GAP_MIN = 240;

export type GateInput = {
  from: Date;
  to: Date;
  days: number;
  trackingSince: Date | null;
  heartbeats: Date[];
  daily: Map<string, { screenTimeMin: number | null; unlocks: number | null }>;
  checkinDates: Set<string>;
};

/** Pure gate evaluation, so the rules are testable without a database. */
export function evaluateGate(input: GateInput): GateResponse {
  const { from, to, days, heartbeats } = input;
  const beats = [...heartbeats].sort((a, b) => a.getTime() - b.getTime());

  // Silences longer than MAX_GAP_MIN, including before the first and after the last heartbeat.
  // Before tracking started nothing is expected, so the window effectively starts there.
  const start = input.trackingSince && input.trackingSince > from ? input.trackingSince : from;
  const points = [start, ...beats.filter((b) => b >= start && b <= to), to];
  const gaps: GateResponse["gaps"] = [];
  for (let i = 1; i < points.length; i++) {
    const minutes = Math.floor((points[i]!.getTime() - points[i - 1]!.getTime()) / 60_000);
    if (minutes > MAX_GAP_MIN) {
      gaps.push({ from: points[i - 1]!.toISOString(), to: points[i]!.toISOString(), minutes });
    }
  }
  if (input.trackingSince === null) gaps.length = 0; // nothing to judge yet

  // Local calendar dates the window touches, oldest first (calendar maths, so DST can't skip one).
  const dates = datesBetween(toLocalDate(from), toLocalDate(to));
  const perDay = dates.map((date) => {
    const daily = input.daily.get(date);
    return {
      date,
      heartbeats: beats.filter((b) => toLocalDate(b) === date).length,
      screen_time_min: daily?.screenTimeMin ?? null,
      unlocks: daily?.unlocks ?? null,
      checkin: input.checkinDates.has(date),
    };
  });

  const trackedDays = input.trackingSince
    ? Math.min(days, Math.floor((to.getTime() - input.trackingSince.getTime()) / 86_400_000))
    : 0;
  const fullWindow = input.trackingSince !== null && input.trackingSince <= from;
  // Today is still in progress, so only earlier days must already have data.
  const everyDayHasData = perDay
    .slice(0, -1)
    .every((d) => d.heartbeats > 0 && ((d.screen_time_min ?? 0) > 0 || (d.unlocks ?? 0) > 0));
  const passed = fullWindow && gaps.length === 0 && everyDayHasData;

  // Check-ins are due on finished days since tracking began (today's comes at 21:30).
  const firstTracked = input.trackingSince ? toLocalDate(input.trackingSince) : null;
  const missingCheckins = perDay
    .slice(0, -1)
    .filter((d) => firstTracked !== null && d.date >= firstTracked && !d.checkin).length;
  const checkinNote = missingCheckins === 0 ? "" : ` ${missingCheckins} day(s) without a check-in.`;
  const summary =
    input.trackingSince === null
      ? "No data from the phone yet."
      : passed
        ? `Passed: ${days} days with no gaps.${checkinNote}`
        : gaps.length > 0
          ? `${gaps.length} gap(s) longer than ${MAX_GAP_MIN / 60} h in the last ${days} days.${checkinNote}`
          : !fullWindow
            ? `Day ${trackedDays + 1} of ${days}, no gaps so far.${checkinNote}`
            : `Some days have no screen time or unlocks.${checkinNote}`;

  return {
    from: from.toISOString(),
    to: to.toISOString(),
    days,
    tracking_since: input.trackingSince?.toISOString() ?? null,
    max_gap_min: MAX_GAP_MIN,
    gaps,
    per_day: perDay,
    passed,
    summary,
  };
}

/** Inclusive list of YYYY-MM-DD dates from [first] to [last]. */
export function datesBetween(first: string, last: string): string[] {
  const out: string[] = [];
  for (let d = new Date(`${first}T00:00:00Z`); d.toISOString().slice(0, 10) <= last;) {
    out.push(d.toISOString().slice(0, 10));
    d = new Date(d.getTime() + 86_400_000);
  }
  return out;
}

/** Loads the last [days] days (ending at [now]) and evaluates the gate. */
export async function getGate(db: Db, days: number, now = new Date()): Promise<GateResponse> {
  const from = new Date(now.getTime() - days * 86_400_000);

  // Only the phone's heartbeats count; the deploy smoke test writes one dated 2000-01-01.
  const phoneHeartbeat = and(
    eq(events.type, "heartbeat"),
    ne(events.deviceId, SMOKE_TEST_DEVICE_ID),
  );
  const [first] = await db
    .select({ at: min(events.occurredAt) })
    .from(events)
    .where(phoneHeartbeat);
  const beats = await db
    .select({ at: events.occurredAt })
    .from(events)
    .where(and(phoneHeartbeat, between(events.occurredAt, from, now)))
    .orderBy(asc(events.occurredAt));

  const fromDate = toLocalDate(from);
  const toDate = toLocalDate(now);
  const summaries = await db
    .select()
    .from(dailySummary)
    .where(and(gte(dailySummary.date, fromDate), lte(dailySummary.date, toDate)));
  const checkinRows = await db
    .select({ date: checkins.date })
    .from(checkins)
    .where(and(gte(checkins.date, fromDate), lte(checkins.date, toDate)));

  return evaluateGate({
    from,
    to: now,
    days,
    trackingSince: first?.at ?? null,
    heartbeats: beats.map((b) => b.at),
    daily: new Map(
      summaries.map((s) => [s.date, { screenTimeMin: s.screenTimeMin, unlocks: s.unlocks }]),
    ),
    checkinDates: new Set(checkinRows.map((c) => c.date)),
  });
}
