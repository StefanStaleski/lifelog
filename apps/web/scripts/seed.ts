/**
 * Fills the LOCAL database with ~60 days of believable, synthetic phone data by sending events
 * through the real ingest pipeline. For working on the dashboard: `pnpm --filter web seed`.
 * Refuses to touch anything but a local database. Deterministic (seeded), so screenshots repeat.
 */
import { createHmac, randomUUID } from "node:crypto";
import { appTags, contextDaily, places, serverSecrets } from "@lifelog/shared/db";
import { sql } from "drizzle-orm";
import { closeDb, getDb } from "@/lib/db";
import { ingestBatch } from "@/lib/ingest";

const url = process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:55322/postgres";
if (!/@(127\.0\.0\.1|localhost)[:/]/.test(url)) {
  console.error("Refusing to seed a non-local database.");
  process.exit(1);
}
process.env.DATABASE_URL = url;

// Small seeded PRNG (mulberry32)
let s = 20260927;
const rand = () => {
  s = (s + 0x6d2b79f5) | 0;
  let t = Math.imul(s ^ (s >>> 15), 1 | s);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const between = (a: number, b: number) => a + rand() * (b - a);
const pick = <T>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)]!;

const DAYS = 60;
const OFFSET_H = 2; // Europe/Skopje summer time, good enough for synthetic data
const APPS = [
  ["com.facebook.orca", "Messenger", "social", 1.4],
  ["com.android.chrome", "Chrome", null, 1.0],
  ["com.instagram.android", "Instagram", "social", 1.1],
  ["com.google.android.youtube", "YouTube", "video", 0.9],
  ["com.spotify.music", "Spotify", "audio", 0.4],
  ["com.google.android.gm", "Gmail", "productivity", 0.4],
  ["com.google.android.apps.maps", "Maps", "maps", 0.2],
  ["com.slack", "Slack", "productivity", 0.6],
] as const;

// Laptop (ActivityWatch): [app, host, weight] for work hours and for evenings.
const WORK_DESKTOP = [
  ["code", null, 3],
  ["firefox", "github.com", 1.2],
  ["firefox", "docs.google.com", 0.6],
  ["firefox", "stackoverflow.com", 0.5],
  ["slack", null, 0.8],
  ["gnome-terminal", null, 1],
] as const;
const EVENING_DESKTOP = [
  ["firefox", "youtube.com", 2],
  ["firefox", "reddit.com", 1],
  ["spotify", null, 0.6],
  ["code", null, 0.7], // after-hours work
] as const;
const WORK_TAGS = [
  ["desktop", "code", true],
  ["desktop", "slack", true],
  ["desktop", "gnome-terminal", true],
  ["desktop", "spotify", false],
  ["host", "github.com", true],
  ["host", "docs.google.com", true],
  ["host", "stackoverflow.com", true],
  ["host", "youtube.com", false],
  ["host", "reddit.com", false],
  ["phone", "com.slack", true],
  ["phone", "com.google.android.gm", true],
  ["phone", "com.instagram.android", false],
] as const;
// Fake people (numbers are never real: +389 70 000 0xx). null name = not in contacts.
const CONTACTS = [
  ["+38970000001", "Mom", 3],
  ["+38970000002", "Ana", 2],
  ["+38970000003", "Marko", 1],
  ["+38970000004", "Elena", 0.6],
  ["+38970000005", null, 0.4],
] as const;
const SENDERS = [
  ["com.whatsapp", "WhatsApp", "Ana", null, 2],
  ["com.whatsapp", "WhatsApp", "Marko", "Football Thursday", 1.5],
  ["com.whatsapp", "WhatsApp", "Mom", null, 1],
  ["com.facebook.orca", "Messenger", "Elena", null, 0.8],
  ["org.telegram.messenger", "Telegram", "Dev team", null, 0.6],
] as const;
const weighted = <T extends readonly unknown[]>(xs: readonly T[]): T => {
  const total = xs.reduce((a, x) => a + (x.at(-1) as number), 0);
  let r = rand() * total;
  for (const x of xs) if ((r -= x.at(-1) as number) <= 0) return x;
  return xs[xs.length - 1]!;
};

type Ev = Record<string, unknown>;
const ev = (type: string, at: Date, payload: object, ended?: Date): Ev => ({
  id: randomUUID(),
  type,
  occurred_at: at.toISOString().replace(/\.\d{3}Z$/, "Z"),
  ...(ended ? { ended_at: ended.toISOString().replace(/\.\d{3}Z$/, "Z") } : {}),
  device_id: "seed",
  payload,
});
/** Local wall-clock time on day `d` (0 = oldest) → UTC Date. */
const at = (dayStart: Date, hour: number) =>
  new Date(dayStart.getTime() + (hour - OFFSET_H) * 3_600_000);

async function main() {
  const db = getDb();
  // server_secrets (the contact salt) and work_settings are settings, not data: never truncated.
  await db.execute(
    sql`truncate events, app_usage, unlocks, checkins, source_health, daily_summary, places, visits, location_stays, steps_hourly, activity_segments, screen_events, sleep_estimates, notifications_hourly, context_daily, dismissed_suggestions, app_usage_windows, desktop_usage, calls, sms_messages, message_counts, people, app_tags`,
  );
  const [secrets] = await db.select().from(serverSecrets);
  if (!secrets) throw new Error("server_secrets is empty: run pnpm db:reset");
  const hmac = (value: string) =>
    createHmac("sha256", secrets.contactSalt).update(value).digest("hex");
  await db
    .insert(appTags)
    .values(WORK_TAGS.map(([source, key, isWork]) => ({ source, key, isWork })));
  const [home, work, gym] = await db
    .insert(places)
    .values([
      { name: "Home", kind: "home", lat: 41.9981, lng: 21.4254, radiusM: 120 },
      { name: "Office", kind: "work", lat: 41.9965, lng: 21.4314, radiusM: 150 },
      { name: "Gym", kind: "gym", lat: 42.0042, lng: 21.4096, radiusM: 100 },
    ])
    .returning();

  const now = new Date();
  const todayUtcMidnight = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  let total = 0;

  for (let d = DAYS; d >= 0; d--) {
    const day = new Date(todayUtcMidnight.getTime() - d * 86_400_000);
    const weekday = (day.getUTCDay() + 6) % 7; // Mon = 0
    const workday = weekday < 5;
    const isToday = d === 0;
    const nowLocalH = (now.getTime() - day.getTime()) / 3_600_000 + OFFSET_H;
    const until = isToday ? nowLocalH - 0.6 : 24; // today: only what has "happened"
    const events: Ev[] = [];
    const push = (hour: number, e: () => Ev) => {
      if (hour < until) events.push(e());
    };

    // Sleep: wake 6:30–8:30 (later at weekends), bed 23:00–00:45
    const wake = workday ? between(6.4, 7.6) : between(7.8, 9.2);
    const bed = between(23, 24.75) + (workday ? 0 : 0.5);
    const lateNight = rand() < 0.25; // some evenings with more scrolling
    push(wake, () => ev("unlock", at(day, wake), {}));
    push(wake, () => ev("screen", at(day, wake - 0.01), { state: "on" }));

    // Unlocks through the day (more on weekends / late nights)
    const unlockCount = Math.round(between(55, 95) * (workday ? 1 : 1.15) * (lateNight ? 1.2 : 1));
    for (let i = 0; i < unlockCount; i++) {
      const h = between(wake + 0.2, bed - 0.1);
      push(h, () => ev("unlock", at(day, h), {}));
    }
    push(bed, () => ev("screen", at(day, bed), { state: "off" }));

    // App usage in 30-min windows; heavier in the evening
    for (let w = Math.ceil(wake * 2); w < Math.floor(bed * 2); w++) {
      const h = w / 2;
      if (h + 0.5 > until) break;
      const evening = h >= 19 ? 1.6 : 1;
      if (rand() < 0.45) continue;
      const [pkg, label, category, weight] = pick(APPS);
      const minutes = Math.min(30, between(2, 14) * weight * evening * (lateNight ? 1.3 : 1));
      const start = at(day, h);
      events.push(
        ev(
          "app_usage",
          start,
          {
            package: pkg,
            app_label: label,
            category,
            foreground_ms: Math.round(minutes * 60_000),
            launches: 1 + Math.floor(rand() * 4),
          },
          new Date(start.getTime() + 1_800_000),
        ),
      );
    }

    // Steps per hour: commute peaks on workdays, a long walk some weekend afternoons
    for (let h = Math.ceil(wake); h < Math.floor(bed); h++) {
      if (h + 1 > until) break;
      let steps = between(80, 450);
      if (workday && (h === 8 || h === 17)) steps += between(1200, 2200);
      if (!workday && h >= 14 && h <= 16 && rand() < 0.6) steps += between(1500, 3500);
      const start = at(day, h);
      events.push(
        ev(
          "steps",
          start,
          { steps: Math.round(steps), distance_m: Math.round(steps * 0.75) },
          new Date(start.getTime() + 3_600_000),
        ),
      );
    }

    // Notifications per app per finished hour (counts only)
    for (let h = Math.ceil(wake); h < Math.floor(bed); h++) {
      if (h + 1 > until) break;
      for (const [pkg, label, , weight] of APPS.slice(0, 5)) {
        const n = Math.round(between(0, 4) * weight * (workday ? 1.2 : 0.8));
        if (n === 0) continue;
        const start = at(day, h);
        events.push(
          ev(
            "notifications",
            start,
            { package: pkg, app_label: label, count: n },
            new Date(start.getTime() + 3_600_000),
          ),
        );
      }
    }

    // Places: home → office (workdays) → gym (Mon/Wed/Fri) → home
    const fence = (id: string, h: number, t: "enter" | "exit") =>
      push(h, () => ev("geofence", at(day, h), { place_id: id, transition: t }));
    fence(home!.id, 0.01, "enter");
    // Works from home; the office only on Wednesdays, the gym after work on Mondays and Fridays.
    if (workday) {
      const back = between(17, 17.8);
      if (weekday === 2) {
        const leave = between(8.1, 8.6);
        fence(home!.id, leave, "exit");
        fence(work!.id, leave + 0.4, "enter");
        fence(work!.id, back, "exit");
        fence(home!.id, back + 0.4, "enter");
        push(wake + 0.8, () =>
          ev("activity", at(day, 8.2), { activity: "in_vehicle", transition: "enter" }),
        );
      } else if (weekday % 2 === 0) {
        fence(home!.id, back + 0.2, "exit");
        fence(gym!.id, back + 0.5, "enter");
        fence(gym!.id, back + 1.7, "exit");
        fence(home!.id, back + 2, "enter");
      }
    } else if (rand() < 0.7) {
      const out = between(11, 14);
      fence(home!.id, out, "exit");
      const stayEnd = out + between(1, 3);
      push(stayEnd, () =>
        ev("stay", at(day, out + 0.3), { lat: 41.996, lng: 21.439 }, at(day, stayEnd)),
      );
      fence(home!.id, stayEnd + 0.3, "enter");
    }
    fence(home!.id, 23.9, "exit"); // split at midnight so every day has a closed visit
    push(bed + 0.05, () =>
      ev("activity", at(day, bed + 0.05), { activity: "still", transition: "enter" }),
    );

    // Evening check-in most days; mood follows sleep and late nights a little
    if (rand() < 0.85) {
      const sleepHours = wake + 24 - bed;
      const base =
        3 + (sleepHours > 7.2 ? 0.8 : -0.4) + (lateNight ? -0.6 : 0.2) + (workday ? 0 : 0.4);
      const score = (x: number) => Math.max(1, Math.min(5, Math.round(x + between(-0.9, 0.9))));
      const tags = [
        workday ? "deep work" : "family",
        weekday % 2 === 0 && workday ? "gym" : null,
        lateNight ? "late night" : null,
      ].filter(Boolean);
      push(21.6, () =>
        ev("checkin", at(day, 21.6), {
          date: new Date(day.getTime()).toISOString().slice(0, 10),
          mood: score(base),
          energy: score(base - 0.2),
          focus: score(base + (workday ? 0.3 : -0.3)),
          tags,
          note:
            rand() < 0.2
              ? pick(["Good long walk.", "Too much coffee.", "Slept badly.", "Productive day!"])
              : null,
        }),
      );
    }

    // Heartbeats every 30 min while "awake" plus a few at night, charging overnight
    for (let h = 0; h < 24; h += 0.5) {
      const asleep = h < wake || h > bed;
      if (asleep && rand() < 0.5) continue;
      push(h, () =>
        ev("heartbeat", at(day, h), {
          app_version: "0.2.0",
          pending_count: 0,
          collection_paused: false,
          usage_access_granted: true,
          battery_optimization_ignored: true,
          charging: asleep,
          battery_pct: Math.round(asleep ? 90 : between(30, 85)),
          health_connect_granted: true,
          activity_recognition_granted: true,
          location_granted: true,
          background_location_granted: true,
        }),
      );
    }

    // Laptop: work hours on workdays (earlier/later some days), evenings for fun or more work
    const laptopEvening = rand() < (workday ? 0.55 : 0.4);
    const workStart = between(8.5, 9.5);
    const workEnd = between(16.8, 18);
    for (let w = 16; w < 48; w++) {
      const h = w / 2;
      if (h + 0.5 > until) break;
      const inWork = workday && h + 0.5 > workStart && h < workEnd;
      const evening = laptopEvening && h >= 19.5 && h < bed - 0.5;
      if (!(inWork ? rand() < 0.88 : evening && rand() < 0.6)) continue;
      const pool: readonly (readonly [string, string | null, number])[] = inWork
        ? WORK_DESKTOP
        : EVENING_DESKTOP;
      let left = inWork ? between(18, 29) : between(8, 28);
      const start = at(day, h);
      const rows = new Map<string, [string, string | null, number]>();
      while (left >= 1) {
        const [app, host] = weighted(pool);
        const m = Math.min(left, between(3, 20));
        const key = `${app}|${host}`;
        rows.set(key, [app, host, (rows.get(key)?.[2] ?? 0) + m]);
        left -= m;
      }
      for (const [app, host, m] of rows.values()) {
        events.push(
          ev(
            "desktop_usage",
            start,
            { app, host, active_ms: Math.round(m * 60_000) },
            new Date(start.getTime() + 1_800_000),
          ),
        );
      }
      events.push(
        ev("desktop_heartbeat", new Date(start.getTime() + 1_830_000), {
          client_version: "0.1.0",
          aw_version: "v0.13.2",
          aw_reachable: true,
          pending_count: 0,
        }),
      );
    }

    // Calls and SMS with a few (fake) people; names from "contacts", unknown numbers hash only
    const callCount = Math.floor(between(0, workday ? 3.5 : 4.5));
    for (let i = 0; i < callCount; i++) {
      const [number, name] = weighted(CONTACTS);
      const h = between(wake + 0.5, bed - 0.5);
      const r = rand();
      const direction =
        r < 0.45 ? "incoming" : r < 0.85 ? "outgoing" : r < 0.95 ? "missed" : "rejected";
      const duration =
        direction === "incoming" || direction === "outgoing" ? Math.round(between(20, 900)) : 0;
      const start = at(day, h);
      push(h + duration / 3600, () =>
        ev(
          "call",
          start,
          { direction, duration_s: duration, contact_hash: hmac(number), contact_name: name },
          new Date(start.getTime() + duration * 1000),
        ),
      );
    }
    const smsCount = Math.floor(between(0, 2.2));
    for (let i = 0; i < smsCount; i++) {
      const [number, name] = weighted(CONTACTS);
      const h = between(wake + 0.5, bed - 0.5);
      push(h, () =>
        ev("sms", at(day, h), {
          direction: rand() < 0.6 ? "in" : "out",
          contact_hash: hmac(number),
          contact_name: name,
        }),
      );
    }

    // Messaging apps: messages received per sender per finished hour (from notifications)
    for (let h = Math.ceil(wake); h < Math.floor(bed); h++) {
      if (h + 1 > until) break;
      for (const [pkg, label, sender, conversation, weight] of SENDERS) {
        if (rand() > weight * 0.18) continue;
        const start = at(day, h);
        events.push(
          ev(
            "messages",
            start,
            {
              package: pkg,
              app_label: label,
              sender_hash: hmac(`${pkg}|${sender}`),
              sender_name: sender,
              conversation,
              count: 1 + Math.floor(rand() * 5),
            },
            new Date(start.getTime() + 3_600_000),
          ),
        );
      }
    }

    // Weather: a mild September with the odd rainy day
    const rainy = rand() < 0.25;
    await db.insert(contextDaily).values({
      date: day.toISOString().slice(0, 10),
      tempMax: Math.round(between(18, 28) * 10) / 10,
      tempMin: Math.round(between(8, 14) * 10) / 10,
      precipMm: rainy ? Math.round(between(1, 12) * 10) / 10 : 0,
      weatherCode: rainy ? 61 : pick([0, 1, 2, 3]),
    });

    events.sort((a, b) => String(a.occurred_at).localeCompare(String(b.occurred_at)));
    for (let i = 0; i < events.length; i += 500) {
      const res = await ingestBatch(db, events.slice(i, i + 500));
      if (res.rejected.length) console.warn("rejected", res.rejected.slice(0, 2));
      total += res.accepted;
    }
  }
  // Settle "now"-dependent rows the way the nightly job does.
  await db.execute(sql`select public.nightly_rebuild()`);
  console.log(`Seeded ${total} events over ${DAYS + 1} days.`);
  await closeDb();
}

main().catch(async (e) => {
  console.error(e);
  await closeDb();
  process.exit(1);
});
