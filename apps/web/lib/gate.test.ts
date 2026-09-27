import { randomUUID } from "node:crypto";
import { GateResponseSchema } from "@lifelog/shared";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { GET } from "@/app/api/v1/gate/route";
import { closeDb, getDb } from "@/lib/db";
import { resetDb, validFixtures } from "@/test/helpers";
import { datesBetween, evaluateGate, type GateInput, getGate, MAX_GAP_MIN } from "./gate";
import { ingestBatch } from "./ingest";

const now = new Date("2026-09-27T16:00:00Z"); // 18:00 local
const from = new Date(now.getTime() - 7 * 86_400_000);
const every = (minutes: number, start: Date, end: Date) => {
  const out: Date[] = [];
  for (let t = start.getTime(); t <= end.getTime(); t += minutes * 60_000) out.push(new Date(t));
  return out;
};
const fullDays = () =>
  new Map(
    datesBetween("2026-09-20", "2026-09-27").map((d) => [d, { screenTimeMin: 120, unlocks: 40 }]),
  );

function input(over: Partial<GateInput> = {}): GateInput {
  return {
    from,
    to: now,
    days: 7,
    trackingSince: new Date("2026-09-15T00:00:00Z"),
    heartbeats: every(30, from, now),
    daily: fullDays(),
    checkinDates: new Set(datesBetween("2026-09-20", "2026-09-27")),
    ...over,
  };
}

describe("evaluateGate", () => {
  it("passes with steady heartbeats and data every day", () => {
    const gate = evaluateGate(input());
    expect(gate).toMatchObject({ passed: true, gaps: [], summary: "Passed: 7 days with no gaps." });
    expect(gate.per_day.map((d) => d.date)).toEqual(datesBetween("2026-09-20", "2026-09-27"));
    expect(GateResponseSchema.safeParse(gate).success).toBe(true);
  });

  it("tolerates Doze delays up to the limit but not beyond", () => {
    const night = new Date("2026-09-24T22:00:00Z");
    const quiet = (minutes: number) =>
      input({
        heartbeats: every(30, from, now).filter(
          (b) => b <= night || b >= new Date(night.getTime() + minutes * 60_000),
        ),
      });
    expect(evaluateGate(quiet(MAX_GAP_MIN)).passed).toBe(true);

    const gate = evaluateGate(quiet(MAX_GAP_MIN + 30));
    expect(gate.passed).toBe(false);
    expect(gate.gaps).toEqual([
      {
        from: night.toISOString(),
        to: new Date(night.getTime() + 270 * 60_000).toISOString(),
        minutes: 270,
      },
    ]);
    expect(gate.summary).toBe("1 gap(s) longer than 4 h in the last 7 days.");
  });

  it("counts silence up to now as a gap (the collector died)", () => {
    const gate = evaluateGate(
      input({ heartbeats: every(30, from, new Date(now.getTime() - 5 * 3_600_000)) }),
    );
    expect(gate.gaps.at(-1)).toMatchObject({ to: now.toISOString(), minutes: 300 });
  });

  it("reports progress while fewer than 7 days are tracked", () => {
    const since = new Date("2026-09-25T10:00:00Z");
    const gate = evaluateGate(input({ trackingSince: since, heartbeats: every(30, since, now) }));
    expect(gate.passed).toBe(false);
    expect(gate.gaps).toEqual([]); // nothing expected before tracking started
    expect(gate.summary).toBe("Day 3 of 7, no gaps so far.");
  });

  it("fails when a past day has no screen time or unlocks, but not for today", () => {
    const daily = fullDays();
    daily.delete("2026-09-27");
    expect(evaluateGate(input({ daily })).passed).toBe(true);

    daily.set("2026-09-23", { screenTimeMin: 0, unlocks: 0 });
    const gate = evaluateGate(input({ daily }));
    expect(gate.passed).toBe(false);
    expect(gate.summary).toBe("Some days have no screen time or unlocks.");
  });

  it("mentions missing check-ins without failing", () => {
    const gate = evaluateGate(input({ checkinDates: new Set(["2026-09-26"]) }));
    expect(gate.passed).toBe(true);
    expect(gate.summary).toBe("Passed: 7 days with no gaps. 6 day(s) without a check-in.");
  });

  it("says so when the phone has never reported", () => {
    const gate = evaluateGate(
      input({ trackingSince: null, heartbeats: [], daily: new Map(), checkinDates: new Set() }),
    );
    expect(gate).toMatchObject({ passed: false, gaps: [], summary: "No data from the phone yet." });
  });
});

describe("datesBetween", () => {
  it("does not skip or repeat days across the DST change", () => {
    expect(datesBetween("2026-10-24", "2026-10-26")).toEqual([
      "2026-10-24",
      "2026-10-25",
      "2026-10-26",
    ]);
  });
});

describe("GET /api/v1/gate", () => {
  const fx = validFixtures();

  beforeEach(resetDb);
  afterAll(closeDb);

  it("requires the token and a sane days value", async () => {
    expect((await GET(new Request("http://localhost/api/v1/gate"))).status).toBe(401);
    const auth = { authorization: "Bearer test-device-token" };
    expect(
      (await GET(new Request("http://localhost/api/v1/gate?days=0", { headers: auth }))).status,
    ).toBe(400);
    expect(
      (await GET(new Request("http://localhost/api/v1/gate?days=abc", { headers: auth }))).status,
    ).toBe(400);
  });

  it("reads heartbeats, summaries and check-ins from the database", async () => {
    const beat = (iso: string) => ({ ...fx.heartbeat, id: randomUUID(), occurred_at: iso });
    await ingestBatch(getDb(), [
      beat("2026-09-27T08:00:00Z"),
      beat("2026-09-27T10:00:00Z"),
      { ...fx.unlock, id: randomUUID(), occurred_at: "2026-09-27T09:00:00Z" },
      fx.checkin,
    ]);
    const gate = await getGate(getDb(), 7, new Date("2026-09-27T12:00:00Z"));
    expect(gate.tracking_since).toBe("2026-09-27T08:00:00.000Z");
    expect(gate.per_day.at(-1)).toEqual({
      date: "2026-09-27",
      heartbeats: 2,
      screen_time_min: null,
      unlocks: 1,
      checkin: true,
    });
    expect(gate.summary).toBe("Day 1 of 7, no gaps so far.");
  });
});
