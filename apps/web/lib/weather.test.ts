import { contextDaily, places } from "@lifelog/shared/db";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/v1/jobs/daily/route";
import { closeDb, getDb } from "@/lib/db";
import { resetDb } from "@/test/helpers";
import { describeWeather, parseOpenMeteo, refreshWeather } from "./weather";

beforeEach(resetDb);
afterAll(closeDb);

const sample = {
  daily: {
    time: ["2026-09-25", "2026-09-26", "2026-09-27"],
    temperature_2m_max: [16.9, 18.2, 22.6],
    temperature_2m_min: [10.5, 13.4, 11.4],
    precipitation_sum: [4.3, 4.1, 0],
    weather_code: [80, 61, 3],
  },
};
const fakeFetch = (body: unknown) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status: 200 })) as unknown as typeof fetch;

describe("weather", () => {
  it("parses Open-Meteo daily data", () => {
    expect(parseOpenMeteo(sample)[2]).toEqual({
      date: "2026-09-27",
      tempMax: 22.6,
      tempMin: 11.4,
      precipMm: 0,
      weatherCode: 3,
    });
  });

  it("stores days, updates them on the next run, and asks for Home's rounded location", async () => {
    await getDb()
      .insert(places)
      .values({ name: "Home", kind: "home", lat: 41.99812, lng: 21.42541, radiusM: 120 });
    const f = fakeFetch(sample);
    expect(await refreshWeather(getDb(), f)).toBe(3);
    expect(String((f as unknown as { mock: { calls: string[][] } }).mock.calls[0]![0])).toContain(
      "latitude=42&longitude=21.43",
    );

    await refreshWeather(
      getDb(),
      fakeFetch({ daily: { ...sample.daily, temperature_2m_max: [17, 18, 25] } }),
    );
    const rows = await getDb().select().from(contextDaily);
    expect(rows).toHaveLength(3);
    expect(rows.find((r) => r.date === "2026-09-27")?.tempMax).toBe(25);
  });

  it("describes weather codes", () => {
    expect(describeWeather(0)).toEqual({ emoji: "☀️", text: "Clear" });
    expect(describeWeather(61).text).toBe("Rain");
    expect(describeWeather(95).text).toBe("Thunderstorm");
  });

  it("the daily job needs the cron secret", async () => {
    vi.stubEnv("CRON_SECRET", "s3cret");
    expect((await GET(new Request("http://x/api/v1/jobs/daily"))).status).toBe(401);
    expect(
      (
        await GET(
          new Request("http://x/api/v1/jobs/daily", { headers: { authorization: "Bearer nope" } }),
        )
      ).status,
    ).toBe(401);
    vi.unstubAllEnvs();
  });
});
