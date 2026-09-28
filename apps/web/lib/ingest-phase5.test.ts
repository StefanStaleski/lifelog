import { randomUUID } from "node:crypto";
import {
  appTags,
  appUsageWindows,
  calls,
  dailySummary,
  desktopUsage,
  messageCounts,
  people,
  places,
  smsMessages,
  sourceHealth,
  workSettings,
} from "@lifelog/shared/db";
import { asc, eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/lib/db";
import { resetDb, validFixtures } from "@/test/helpers";
import { ingestBatch } from "./ingest";

const fx = validFixtures();
const db = () => getDb();

beforeEach(resetDb);
afterAll(closeDb);

// 2026-09-28 is a Monday; Europe/Skopje is UTC+2 then, so 09:00 local = 07:00Z.
const DAY = "2026-09-28";
const plus = (iso: string, ms: number) => new Date(Date.parse(iso) + ms).toISOString();
const ev = (type: string, occurred_at: string, payload: object, ended_at?: string) => ({
  id: randomUUID(),
  type,
  occurred_at,
  ...(ended_at ? { ended_at } : {}),
  device_id: type.startsWith("desktop") ? "laptop" : "s24",
  payload,
});
const hash = (c: string) => c.repeat(64);
const min = (m: number) => m * 60_000;

const desktop = (at: string, app: string, minutes: number, host: string | null = null) =>
  ev("desktop_usage", at, { app, host, active_ms: min(minutes) }, plus(at, 1_800_000));
const phoneApp = (at: string, pkg: string, minutes: number) =>
  ev(
    "app_usage",
    at,
    { package: pkg, app_label: pkg, category: null, foreground_ms: min(minutes), launches: 1 },
    plus(at, 1_800_000),
  );
const call = (
  at: string,
  direction: string,
  duration_s: number,
  contact_hash: string,
  contact_name: string | null,
) =>
  ev(
    "call",
    at,
    { direction, duration_s, contact_hash, contact_name },
    plus(at, duration_s * 1000),
  );
const sms = (at: string, contact_hash: string, contact_name: string | null) =>
  ev("sms", at, { direction: "in", contact_hash, contact_name });
const messages = (
  hour: string,
  pkg: string,
  sender_hash: string,
  sender_name: string,
  count: number,
) =>
  ev(
    "messages",
    hour,
    { package: pkg, app_label: pkg, sender_hash, sender_name, conversation: null, count },
    plus(hour, 3_600_000),
  );

const summary = async (date: string) =>
  (await db().select().from(dailySummary).where(eq(dailySummary.date, date)))[0];
const refresh = (date: string) =>
  db().execute(sql`select public.refresh_daily_summary(array[${date}]::date[])`);
const tag = (source: "phone" | "desktop" | "host", key: string, isWork: boolean) =>
  db().insert(appTags).values({ source, key, isWork });

describe("desktop_usage", () => {
  it("stores windows with '' for no host and keeps the larger value on a resend", async () => {
    await ingestBatch(db(), [fx.desktop_usage, fx["desktop_usage-browser"]]);
    const again = await ingestBatch(db(), [fx.desktop_usage]);
    expect(again).toMatchObject({ accepted: 0, duplicates: 1 });

    await ingestBatch(db(), [desktop("2026-09-28T07:30:00Z", "code", 25)]); // new id, larger
    await ingestBatch(db(), [desktop("2026-09-28T07:30:00Z", "code", 3)]); // new id, smaller

    const rows = await db().select().from(desktopUsage).orderBy(asc(desktopUsage.host));
    expect(rows).toEqual([
      {
        windowStart: new Date("2026-09-28T07:30:00Z"),
        app: "code",
        host: "",
        activeMs: min(25),
        deviceId: "laptop",
      },
      {
        windowStart: new Date("2026-09-28T07:30:00Z"),
        app: "firefox",
        host: "github.com",
        activeMs: 420_000,
        deviceId: "laptop",
      },
    ]);
    expect(await summary(DAY)).toMatchObject({ desktopMin: 30 }); // 25 + 7, capped per window
  });

  it("caps laptop minutes at 30 per window", async () => {
    await ingestBatch(db(), [
      desktop("2026-09-28T10:00:00Z", "code", 20),
      desktop("2026-09-28T10:00:00Z", "firefox", 18, "example.org"),
    ]);
    expect(await summary(DAY)).toMatchObject({ desktopMin: 30 });
  });
});

describe("desktop_heartbeat", () => {
  it("reports the laptop as source 'desktop', newest heartbeat wins", async () => {
    const hb = (at: string, reachable: boolean) =>
      ev("desktop_heartbeat", at, {
        client_version: "0.1.0",
        aw_version: reachable ? "v0.13.2" : null,
        aw_reachable: reachable,
        pending_count: 3,
      });
    await ingestBatch(db(), [hb("2026-09-28T08:00:00Z", false)]);
    await ingestBatch(db(), [hb("2026-09-28T07:00:00Z", true)]); // older, arrives late

    const [desk] = await db().select().from(sourceHealth).where(eq(sourceHealth.source, "desktop"));
    expect(desk).toMatchObject({
      lastEventAt: new Date("2026-09-28T08:00:00Z"),
      lastError: "ActivityWatch not reachable",
      details: expect.objectContaining({ aw_reachable: false, pending_count: 3 }),
    });

    await ingestBatch(db(), [hb("2026-09-28T08:30:00Z", true)]);
    const [after] = await db()
      .select()
      .from(sourceHealth)
      .where(eq(sourceHealth.source, "desktop"));
    expect(after).toMatchObject({
      lastError: null,
      details: expect.objectContaining({ aw_reachable: true }),
    });
  });
});

describe("calls, sms and people", () => {
  const ana = hash("a");
  const unknown = hash("b");

  it("stores calls and SMS once and keeps each person's latest name", async () => {
    const h = (fx.call!.payload as { contact_hash: string }).contact_hash;
    await ingestBatch(db(), [
      fx.call,
      fx["call-missed-unknown"],
      fx.sms,
      call("2026-09-28T18:00:00Z", "incoming", 95, h, null), // same person, no name this time
    ]);
    const again = await ingestBatch(db(), [fx.call, fx.sms]);
    expect(again).toMatchObject({ accepted: 0, duplicates: 2 });
    expect(await db().select().from(calls)).toHaveLength(3);
    expect(await db().select().from(smsMessages)).toEqual([
      {
        id: fx.sms!.id,
        occurredAt: new Date("2026-09-28T12:44:03Z"),
        direction: "in",
        contactHash: h,
        contactName: "Ana Example",
      },
    ]);

    const person = async (key: string) =>
      (await db().select().from(people).where(eq(people.contactHash, key)))[0];
    expect(await person(h)).toMatchObject({
      kind: "phone",
      displayName: "Ana Example",
      label: null,
      hidden: false,
      firstSeenAt: new Date("2026-09-28T12:44:03Z"),
      lastSeenAt: new Date("2026-09-28T18:00:00Z"),
    });
    const missed = fx["call-missed-unknown"]!.payload as { contact_hash: string };
    expect(await person(missed.contact_hash)).toMatchObject({ displayName: null });

    // A newer call under a new contact name renames; an older one or a null name does not.
    await ingestBatch(db(), [call("2026-09-29T09:00:00Z", "outgoing", 10, h, "Ana E.")]);
    await ingestBatch(db(), [call("2026-09-20T09:00:00Z", "outgoing", 10, h, "Old Name")]);
    await ingestBatch(db(), [call("2026-09-29T10:00:00Z", "outgoing", 10, h, null)]);
    expect(await person(h)).toMatchObject({
      displayName: "Ana E.",
      firstSeenAt: new Date("2026-09-20T09:00:00Z"),
      lastSeenAt: new Date("2026-09-29T10:00:00Z"),
    });
  });

  it("counts connected calls and their minutes per local day", async () => {
    await ingestBatch(db(), [
      call("2026-09-28T08:00:00Z", "outgoing", 385, ana, "Ana"),
      call("2026-09-28T09:00:00Z", "incoming", 95, unknown, null),
      call("2026-09-28T10:00:00Z", "missed", 0, unknown, null),
      call("2026-09-28T11:00:00Z", "rejected", 0, ana, "Ana"),
      call("2026-09-28T21:59:00Z", "incoming", 60, ana, "Ana"), // 23:59 local
      call("2026-09-28T22:01:00Z", "incoming", 60, ana, "Ana"), // 00:01 local on the 29th
    ]);
    expect(await summary(DAY)).toMatchObject({ calls: 3, callMin: 9 }); // 540 s
    expect(await summary("2026-09-29")).toMatchObject({ calls: 1, callMin: 1 });

    // Days before the first call ever are unknown, not zero.
    await refresh("2026-09-27");
    expect(await summary("2026-09-27")).toMatchObject({ calls: null, callMin: null });
  });
});

describe("messages", () => {
  const tg = "org.telegram.messenger";
  const ana = hash("c");

  it("keeps the larger count when an hour is re-sent", async () => {
    await ingestBatch(db(), [fx.messages, fx["messages-group"]]);
    await ingestBatch(db(), [messages("2026-09-28T18:00:00Z", tg, hash("1"), "Bo", 1)]);
    const telegramHash = (fx.messages!.payload as { sender_hash: string }).sender_hash;
    await ingestBatch(db(), [messages("2026-09-28T18:00:00Z", tg, telegramHash, "Ana", 4)]);
    expect(await summary(DAY)).toMatchObject({ messagesReceived: 10 }); // 6 + 3 + 1
    await ingestBatch(db(), [messages("2026-09-28T18:00:00Z", tg, telegramHash, "Ana", 8)]);

    const [row] = await db()
      .select()
      .from(messageCounts)
      .where(eq(messageCounts.senderHash, telegramHash));
    expect(row).toMatchObject({ count: 8, senderName: "Ana", conversation: null });
    expect(await summary(DAY)).toMatchObject({ messagesReceived: 12 });
    expect(
      (await db().select().from(people).where(eq(people.contactHash, telegramHash)))[0],
    ).toMatchObject({ kind: "messaging", displayName: "Ana" });
  });

  it("counts distinct people across connected calls, SMS and messages, minus hidden ones", async () => {
    const bob = hash("d");
    const bank = hash("e");
    const stranger = hash("f");
    await ingestBatch(db(), [
      call("2026-09-28T08:00:00Z", "outgoing", 60, bob, "Bob"),
      call("2026-09-28T09:00:00Z", "missed", 0, stranger, null), // not a contact made
      sms("2026-09-28T10:00:00Z", bob, "Bob"), // same person as the call
      sms("2026-09-28T11:00:00Z", bank, null),
      messages("2026-09-28T12:00:00Z", tg, ana, "Ana", 2),
    ]);
    expect(await summary(DAY)).toMatchObject({ peopleContacted: 3 });

    await db().update(people).set({ hidden: true }).where(eq(people.contactHash, bank));
    await refresh(DAY);
    expect(await summary(DAY)).toMatchObject({ peopleContacted: 2 });
  });
});

describe("work minutes", () => {
  // Windows on Monday 28 Sep (local = UTC+2); the default schedule is Mon–Fri 09:00–17:00.
  const A = "2026-09-28T07:00:00Z"; // 09:00 local, in hours
  const B = "2026-09-28T07:30:00Z"; // 09:30, in hours
  const D = "2026-09-28T08:00:00Z"; // 10:00, in hours
  const E = "2026-09-28T06:30:00Z"; // 08:30, before hours
  const C = "2026-09-28T17:00:00Z"; // 19:00, after hours

  async function workday() {
    await tag("desktop", "code", true);
    await tag("desktop", "firefox", false);
    await tag("desktop", "spotify", false);
    await tag("host", "github.com", true);
    await tag("phone", "com.slack", true);
    await tag("phone", "com.instagram.android", false);
    await ingestBatch(db(), [
      // A: laptop work 25 + phone work 20 in one window → capped at 30
      desktop(A, "code", 25),
      phoneApp(A, "com.slack", 20),
      // B: browser — work-tagged host counts; an untagged host falls back to the browser's tag
      desktop(B, "firefox", 12, "github.com"),
      desktop(B, "firefox", 10, "youtube.com"),
      // D: untagged laptop app inside the schedule counts; tagged not-work doesn't; phone
      // apps count only when tagged work
      desktop(D, "libreoffice", 15),
      desktop(D, "spotify", 5),
      phoneApp(D, "com.instagram.android", 10),
      phoneApp(D, "org.telegram.messenger", 10),
      // E: untagged before hours: not work
      desktop(E, "libreoffice", 5),
      // C: after hours — tagged work counts, untagged doesn't
      desktop(C, "code", 20),
      desktop(C, "vlc", 30),
    ]);
  }

  it("unions laptop and phone per window, capped at 30, split in and after hours", async () => {
    await workday();
    expect(await summary(DAY)).toMatchObject({
      workedInHoursMin: 57, // 30 + 12 + 15
      workedAfterHoursMin: 20,
      workedMin: 77,
      firstWorkAt: new Date(A),
      lastWorkAt: new Date("2026-09-28T17:30:00Z"),
      desktopMin: 102, // 25 + 22 + 20 + 5 + 30 (C capped)
    });
    expect(await db().select().from(appUsageWindows)).toHaveLength(3); // tagged or not
  });

  it("follows the schedule and the untagged-laptop setting", async () => {
    await workday();
    await db().update(workSettings).set({ untaggedDesktopIsWork: false });
    await refresh(DAY);
    expect(await summary(DAY)).toMatchObject({ workedInHoursMin: 42, workedAfterHoursMin: 20 });

    // A schedule that ends at 09:30 turns B and D into after-hours work.
    await db().update(workSettings).set({ untaggedDesktopIsWork: true, endLocal: "09:30" });
    await refresh(DAY);
    expect(await summary(DAY)).toMatchObject({ workedInHoursMin: 30, workedAfterHoursMin: 32 });

    // Not a work day: only tagged work counts, all of it after hours.
    await db()
      .update(workSettings)
      .set({ days: [6, 7], endLocal: "17:00" });
    await refresh(DAY);
    expect(await summary(DAY)).toMatchObject({ workedInHoursMin: 0, workedAfterHoursMin: 62 });
  });

  it("is null before the laptop reported and 0 on quiet days after", async () => {
    await ingestBatch(db(), [ev("unlock", "2026-09-27T08:00:00Z", {})]);
    await ingestBatch(db(), [desktop(A, "code", 10)]);
    await ingestBatch(db(), [ev("unlock", "2026-09-29T08:00:00Z", {})]);
    await refresh("2026-09-27");
    expect(await summary("2026-09-27")).toMatchObject({ workedMin: null, desktopMin: null });
    expect(await summary(DAY)).toMatchObject({ workedMin: 10, desktopMin: 10 });
    expect(await summary("2026-09-29")).toMatchObject({
      workedMin: 0,
      workedInHoursMin: 0,
      desktopMin: 0,
      firstWorkAt: null,
    });
  });

  it("counts time at home inside the schedule as working from home", async () => {
    const [home] = await db()
      .insert(places)
      .values({ name: "Home", kind: "home", lat: 41.99, lng: 21.43, radiusM: 120 })
      .returning();
    const fence = (at: string, transition: string) =>
      ev("geofence", at, { place_id: home!.id, transition });
    await ingestBatch(db(), [
      fence("2026-09-28T04:00:00Z", "enter"), // 06:00 local
      fence("2026-09-28T12:00:00Z", "exit"), // 14:00 local
      fence("2026-09-28T16:00:00Z", "enter"), // 18:00 local, after hours
    ]);
    await refresh(DAY);
    expect(await summary(DAY)).toMatchObject({ wfhMin: 300 }); // 09:00–14:00
    await refresh("2026-09-27"); // Sunday: not a work day
    expect(await summary("2026-09-27")).toMatchObject({ wfhMin: null });
  });
});
