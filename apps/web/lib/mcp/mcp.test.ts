import { randomUUID } from "node:crypto";
import { appUsage, checkins, dailySummary, sleepEstimates, sourceHealth } from "@lifelog/shared/db";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { createLocalJWKSet, exportJWK, generateKeyPair, type JWTPayload, SignJWT } from "jose";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { GET as metadataRoute } from "@/app/.well-known/oauth-protected-resource/[[...resource]]/route";
import { closeDb, getDb } from "@/lib/db";
import { addDays, METRIC_NAMES } from "@/lib/metrics";
import { resetDb } from "@/test/helpers";
import { createLifelogMcpHandler } from "./server";
import { TOOLS } from "./tools";

const ISSUER = "https://project.supabase.co/auth/v1";
const OWNER = "owner@example.com";
const NOW = new Date("2026-09-28T10:00:00Z"); // Monday; local date 2026-09-28
const db = () => getDb();

let keys: ReturnType<typeof createLocalJWKSet>;
let privateKey: CryptoKey;
let otherKey: CryptoKey;

beforeAll(async () => {
  process.env.DASHBOARD_EMAIL = OWNER;
  const pair = await generateKeyPair("ES256");
  privateKey = pair.privateKey;
  otherKey = (await generateKeyPair("ES256")).privateKey;
  keys = createLocalJWKSet({
    keys: [{ ...(await exportJWK(pair.publicKey)), kid: "k1", alg: "ES256" }],
  });
});
afterEach(() => vi.unstubAllEnvs());
afterAll(async () => {
  delete process.env.DASHBOARD_EMAIL;
  await closeDb();
});

/** A token shaped like Supabase's OAuth access tokens. */
function token(claims: JWTPayload = {}, { key = privateKey, expiresIn = "1h" } = {}) {
  return new SignJWT({
    aud: "authenticated",
    role: "authenticated",
    email: OWNER,
    client_id: "claude-client",
    scope: "email",
    ...claims,
  })
    .setProtectedHeader({ alg: "ES256", kid: "k1" })
    .setIssuer(ISSUER)
    .setSubject(randomUUID())
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(key);
}

const handler = () => createLifelogMcpHandler({ keys, issuer: ISSUER, now: () => NOW });
const URL_MCP = "http://localhost/api/mcp";
const listTools = (auth?: string) =>
  handler()(
    new Request(URL_MCP, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        ...(auth ? { authorization: auth } : {}),
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
    }),
  );

describe("MCP auth", () => {
  it("answers 401 with a challenge pointing at the resource metadata when there is no token", async () => {
    const res = await listTools();
    expect(res.status).toBe(401);
    const challenge = res.headers.get("www-authenticate")!;
    expect(challenge).toMatch(/^Bearer /);
    expect(challenge).toContain(
      'resource_metadata="http://localhost/.well-known/oauth-protected-resource/api/mcp"',
    );
    expect(challenge).toContain('error="invalid_token"');
  });

  it.each([
    ["wrong audience", () => token({ aud: "https://other.example" })],
    ["expired", () => token({}, { expiresIn: "-1m" })],
    [
      "wrong issuer",
      () =>
        new SignJWT({ aud: "authenticated", email: OWNER, client_id: "c" })
          .setProtectedHeader({ alg: "ES256", kid: "k1" })
          .setIssuer("https://evil.example/auth/v1")
          .setSubject("x")
          .setExpirationTime("1h")
          .sign(privateKey),
    ],
    ["foreign signature", () => token({}, { key: otherKey })],
    ["no client_id (a dashboard session token)", () => token({ client_id: undefined })],
    ["garbage", async () => "not-a-jwt"],
  ])("answers 401 for a token with %s", async (_name, make) => {
    const res = await listTools(`Bearer ${await make()}`);
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toContain("resource_metadata=");
  });

  it("answers 403 to a valid token of someone other than the owner", async () => {
    const res = await listTools(`Bearer ${await token({ email: "someone@example.com" })}`);
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: "access_denied" });
  });

  it("serves the owner", async () => {
    const res = await listTools(`Bearer ${await token()}`);
    expect(res.status).toBe(200);
  });

  it("publishes protected resource metadata naming Supabase Auth", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co/");
    const res = metadataRoute(
      new Request("http://internal/.well-known/oauth-protected-resource/api/mcp", {
        headers: { "x-forwarded-host": "life.example", "x-forwarded-proto": "https" },
      }),
    );
    expect(await res.json()).toMatchObject({
      resource: "https://life.example/api/mcp",
      authorization_servers: [ISSUER],
      scopes_supported: ["email"],
    });
  });
});

// ---- tools, called through a real MCP client over Streamable HTTP (in-process fetch) ----

async function connect() {
  const h = handler();
  const auth = `Bearer ${await token()}`;
  const client = new Client({ name: "test", version: "1.0.0" });
  await client.connect(
    new StreamableHTTPClientTransport(new URL(URL_MCP), {
      requestInit: { headers: { authorization: auth } },
      fetch: (url, init) => h(new Request(url, init)),
    }),
  );
  return client;
}

async function call(client: Client, name: string, args: Record<string, unknown> = {}) {
  const res = await client.callTool({ name, arguments: args });
  const text = (res.content as { type: string; text: string }[])[0]!.text;
  if (res.isError) throw new Error(text);
  return JSON.parse(text);
}

const FIRST = "2026-08-20"; // Thursday; 40 days to 2026-09-28
const dow = (date: string) => new Date(`${date}T12:00:00Z`).getUTCDay(); // 0 = Sunday

async function seed() {
  await db()
    .insert(dailySummary)
    .values(
      Array.from({ length: 40 }, (_, i) => {
        const date = addDays(FIRST, i);
        const weekend = dow(date) === 0 || dow(date) === 6;
        return {
          date,
          screenTimeMin: weekend ? 300 : 200,
          // The nights after weekend days (ending Sun and Mon mornings) are short.
          sleepMin: dow(date) === 0 || dow(date) === 1 ? 360 : 420,
          steps: date <= "2026-09-20" ? 6000 : 9000,
          unlocks: i % 3 === 0 ? null : 50,
          homeMin: 600,
          workMin: weekend ? 0 : 480,
        };
      }),
    );
  const ci = (date: string, mood: number, tags: string[], note: string | null = null) => ({
    date,
    mood,
    energy: 3,
    focus: 3,
    tags,
    note,
    eventId: randomUUID(),
    submittedAt: new Date(`${date}T19:30:00Z`),
  });
  await db()
    .insert(checkins)
    .values([
      ci("2026-09-22", 4, ["gym"]),
      ci("2026-09-24", 5, ["gym", "social"]),
      ci("2026-09-26", 2, ["sick"], "tired"),
    ]);
  await db()
    .insert(sleepEstimates)
    .values([
      ...[1, 2, 3, 4].map((n) => ({
        date: addDays("2026-09-28", -n),
        sleepStart: new Date(`${addDays("2026-09-28", -n - 1)}T21:00:00Z`),
        wakeAt: new Date(`${addDays("2026-09-28", -n)}T04:00:00Z`),
        durationMin: 420,
        confidence: 0.8,
      })),
      {
        date: "2026-09-28",
        sleepStart: new Date("2026-09-27T21:30:00Z"),
        wakeAt: new Date("2026-09-28T05:00:00Z"),
        durationMin: 450,
        confidence: 0.9,
      },
    ]);
  await db()
    .insert(appUsage)
    .values([
      {
        date: "2026-09-27",
        package: "com.instagram.android",
        appLabel: "Instagram",
        category: "social",
        foregroundMs: 3_600_000,
        launches: 20,
      },
      {
        date: "2026-09-28",
        package: "org.telegram",
        appLabel: "Telegram",
        category: null,
        foregroundMs: 1_200_000,
        launches: 10,
      },
    ]);
  await db()
    .insert(sourceHealth)
    .values([
      {
        source: "heartbeat",
        lastEventAt: new Date("2026-09-28T07:00:00Z"), // 3 h ago: over the 2 h allowance
        details: { app_version: "0.3.0", battery_pct: 64, usage_access_granted: true },
      },
      { source: "unlock", lastEventAt: new Date("2026-09-28T09:50:00Z") },
    ]);
}

describe("MCP tools", () => {
  let client: Client;
  beforeAll(async () => {
    await resetDb();
    await seed();
    client = await connect();
  });
  afterAll(async () => {
    await client?.close();
    await resetDb();
  });

  it("lists every registered tool as read-only, with a description", async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name)).toEqual(TOOLS.map((t) => t.name));
    for (const t of tools) {
      expect(t.annotations?.readOnlyHint).toBe(true);
      expect(t.description!.length).toBeGreaterThan(100);
    }
    // query_days offers every metric in the registry.
    const q = tools.find((t) => t.name === "query_days")!;
    const metricEnum = (q.inputSchema.properties!.metrics as { items: { enum: string[] } }).items
      .enum;
    expect(metricEnum).toEqual(METRIC_NAMES);
  });

  it("get_daily_summary: today by default, with the 30-day baseline", async () => {
    const s = await call(client, "get_daily_summary");
    expect(s.from).toBe("2026-09-28");
    expect(s.days).toHaveLength(1);
    expect(s.days[0]).toMatchObject({
      date: "2026-09-28",
      weekday: "mon",
      screen_time_min: 200,
      sleep_min: 360,
    });
    expect(s.baseline_30d.steps.n_days).toBe(30);
    expect(s.baseline_30d).not.toHaveProperty("mood"); // no data → left out
  });

  it("get_daily_summary: a range, and rejects bad input", async () => {
    const s = await call(client, "get_daily_summary", { from: "2026-09-26", to: "2026-09-27" });
    expect(s.days.map((d: { date: string }) => d.date)).toEqual(["2026-09-26", "2026-09-27"]);
    await expect(
      call(client, "get_daily_summary", { from: "2026-09-27", to: "2026-09-26" }),
    ).rejects.toThrow(/from must not be after to/);
    await expect(
      call(client, "get_daily_summary", {
        date: "2026-09-27",
        from: "2026-09-01",
        to: "2026-09-02",
      }),
    ).rejects.toThrow();
  });

  it("get_last_night: the estimate vs the nights before", async () => {
    const n = await call(client, "get_last_night");
    expect(n).toMatchObject({
      date: "2026-09-28",
      sleep_start_local: "23:30",
      wake_local: "07:00",
      duration_min: 450,
      confidence: 0.9,
      baseline_30d: { mean_min: 420, n_nights: 4, mean_sleep_start_local: "23:00" },
      vs_avg_min: 30,
      vs_avg_pct: 7,
    });
    expect(await call(client, "get_last_night", { date: "2026-08-01" })).toEqual({
      date: "2026-08-01",
      sleep: null,
      latest_date: null,
    });
  });

  it("get_trend: last finished week vs the one before", async () => {
    const t = await call(client, "get_trend", { metric: "steps" });
    expect(t).toMatchObject({
      metric: "steps",
      period: "week",
      current: { from: "2026-09-21", to: "2026-09-27", avg: 9000, n_days: 7 },
      previous: { from: "2026-09-14", to: "2026-09-20", avg: 6000, n_days: 7 },
      change: 3000,
      change_pct: 50,
      verdict: "better",
    });
    const s = await call(client, "get_trend", { metric: "screen_time_min", period: "month" });
    expect(s.current.to).toBe("2026-09-27");
    expect(s.current.n_days).toBe(30);
    await expect(call(client, "get_trend", { metric: "nope" })).rejects.toThrow();
  });

  it("get_time_breakdown: places and apps per day", async () => {
    const t = await call(client, "get_time_breakdown", { from: "2026-09-27", to: "2026-09-28" });
    expect(t.n_days).toBe(2);
    expect(t.places_min_per_day).toMatchObject({ home_min: 600, work_min: 240 });
    expect(t.top_apps[0]).toMatchObject({ app: "Instagram", category: "Social", min_per_day: 30 });
    expect(t.app_categories.map((c: { category: string }) => c.category)).toEqual([
      "Social",
      "Other",
    ]);
  });

  it("get_checkins: rows, averages and tag counts", async () => {
    const c = await call(client, "get_checkins");
    expect(c.from).toBe("2026-09-15");
    expect(c.n).toBe(3);
    expect(c.averages.mood).toBeCloseTo(3.7);
    expect(c.tag_counts).toEqual({ gym: 2, social: 1, sick: 1 });
    expect(c.checkins[0]).toMatchObject({
      date: "2026-09-26",
      weekday: "sat",
      tags: ["sick"],
      note: "tired",
    });
  });

  it("get_data_health: flags quiet sources", async () => {
    const h = await call(client, "get_data_health");
    expect(h.all_ok).toBe(false);
    expect(h.quiet_sources).toEqual(["heartbeat"]);
    expect(h.sources.find((s: { source: string }) => s.source === "heartbeat").minutes_since).toBe(
      180,
    );
    expect(h.device).toMatchObject({ app_version: "0.3.0", battery_pct: 64 });
  });

  describe("query_days", () => {
    const q = (args: Record<string, unknown>) => call(client, "query_days", args);
    const range = { from: "2026-09-14", to: "2026-09-27" }; // two full ISO weeks

    it("returns one row per day by default", async () => {
      const r = await q({ ...range, metrics: ["screen_time_min", "unlocks"], weekdays: ["sat"] });
      expect(r.rows).toEqual([
        { date: "2026-09-19", weekday: "sat", screen_time_min: 300, unlocks: null },
        { date: "2026-09-26", weekday: "sat", screen_time_min: 300, unlocks: 50 },
      ]);
      expect(r.n_days).toBe(2);
    });

    it("groups by weekday, week and month with the chosen aggregate", async () => {
      const w = await q({ ...range, metrics: ["screen_time_min"], group_by: "weekday" });
      expect(w.rows).toHaveLength(7);
      expect(w.rows[0]).toEqual({ weekday: "mon", n: 2, screen_time_min: 200 });
      expect(w.rows[6]).toEqual({ weekday: "sun", n: 2, screen_time_min: 300 });
      const wk = await q({ ...range, metrics: ["steps"], group_by: "week", agg: "sum" });
      expect(wk.rows).toEqual([
        { week_start: "2026-09-14", n: 7, steps: 42000 },
        { week_start: "2026-09-21", n: 7, steps: 63000 },
      ]);
      const m = await q({
        from: "2026-08-20",
        to: "2026-09-28",
        metrics: ["unlocks"],
        group_by: "month",
        agg: "count",
      });
      expect(m.rows.map((r: { month: string }) => r.month)).toEqual(["2026-08", "2026-09"]);
      expect(m.n_days).toBe(40);
    });

    it("filters with where conditions and pairs the next day with lag", async () => {
      const r = await q({
        ...range,
        metrics: ["screen_time_min"],
        where: [{ metric: "screen_time_min", op: ">", value: 250 }],
        lag_metrics: ["sleep_min"],
        lag_days: 1,
        group_by: "all",
      });
      expect(r).toMatchObject({ group_by: "all", agg: "avg", lag_days: 1, n_days: 4 });
      expect(r.rows).toEqual([{ n: 4, screen_time_min: 300, sleep_min_lag1d: 360 }]);
      const onLag = await q({
        ...range,
        metrics: ["screen_time_min"],
        where: [{ metric: "sleep_min", op: "<", value: 400, on_lag_day: true }],
        lag_metrics: ["sleep_min"],
      });
      expect(onLag.rows.map((x: { weekday: string }) => x.weekday)).toEqual([
        "sat",
        "sun",
        "sat",
        "sun",
      ]);
    });

    it("filters and groups by check-in tags", async () => {
      const gym = await q({ ...range, metrics: ["mood"], tags: { any: ["gym"] }, group_by: "all" });
      expect(gym.rows).toEqual([{ n: 2, mood: null }]); // mood lives in daily_summary; not seeded there
      const none = await q({
        ...range,
        metrics: ["screen_time_min"],
        tags: { none: ["gym", "sick"] },
      });
      expect(none.n_days).toBe(11);
      const all = await q({
        ...range,
        metrics: ["screen_time_min"],
        tags: { all: ["gym", "social"] },
      });
      expect(all.rows.map((x: { date: string }) => x.date)).toEqual(["2026-09-24"]);
      const byTag = await q({ ...range, metrics: ["screen_time_min"], group_by: "tag" });
      expect(byTag.rows).toEqual([
        { tag: "gym", n: 2, screen_time_min: 200 },
        { tag: "sick", n: 1, screen_time_min: 300 },
        { tag: "social", n: 1, screen_time_min: 200 },
      ]);
      expect(byTag.n_days).toBe(3);
    });

    it("rejects unknown metrics, bad ops and oversized ranges; treats values as data", async () => {
      await expect(q({ ...range, metrics: ["password"] })).rejects.toThrow();
      await expect(
        q({ ...range, metrics: ["steps"], where: [{ metric: "steps", op: "; drop", value: 1 }] }),
      ).rejects.toThrow();
      await expect(q({ from: "2020-01-01", to: "2026-09-27", metrics: ["steps"] })).rejects.toThrow(
        /at most/,
      );
      const r = await q({
        ...range,
        metrics: ["steps"],
        tags: { any: ["x'); drop table events; --"] },
      });
      expect(r.n_days).toBe(0);
    });
  });
});
