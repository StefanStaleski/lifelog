import { LOCAL_TIME_ZONE } from "@lifelog/shared";
import { contextDaily, places } from "@lifelog/shared/db";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "./db";

const SKOPJE = { lat: 41.9981, lng: 21.4254 };

const OpenMeteoDaily = z.object({
  daily: z.object({
    time: z.array(z.iso.date()),
    temperature_2m_max: z.array(z.number().nullable()),
    temperature_2m_min: z.array(z.number().nullable()),
    precipitation_sum: z.array(z.number().nullable()),
    weather_code: z.array(z.number().nullable()),
  }),
});

export type WeatherDay = {
  date: string;
  tempMax: number | null;
  tempMin: number | null;
  precipMm: number | null;
  weatherCode: number | null;
};

export function parseOpenMeteo(json: unknown): WeatherDay[] {
  const d = OpenMeteoDaily.parse(json).daily;
  return d.time.map((date, i) => ({
    date,
    tempMax: d.temperature_2m_max[i] ?? null,
    tempMin: d.temperature_2m_min[i] ?? null,
    precipMm: d.precipitation_sum[i] ?? null,
    weatherCode: d.weather_code[i] ?? null,
  }));
}

/** Where the weather is fetched for: the Home place, or Skopje until one is set. Rounded, no precision needed. */
export async function weatherLocation(db: Db) {
  const [home] = await db
    .select({ lat: places.lat, lng: places.lng })
    .from(places)
    .where(and(eq(places.kind, "home"), isNull(places.archivedAt)))
    .orderBy(asc(places.createdAt))
    .limit(1);
  const p = home ?? SKOPJE;
  return { lat: Math.round(p.lat * 100) / 100, lng: Math.round(p.lng * 100) / 100 };
}

/** The last 3 days (late corrections) plus today's forecast, upserted into context_daily. */
export async function refreshWeather(db: Db, fetcher: typeof fetch = fetch): Promise<number> {
  const { lat, lng } = await weatherLocation(db);
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
    `&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,weather_code` +
    `&timezone=${encodeURIComponent(LOCAL_TIME_ZONE)}&past_days=3&forecast_days=1`;
  const res = await fetcher(url, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`Open-Meteo: HTTP ${res.status}`);
  const days = parseOpenMeteo(await res.json());
  if (days.length === 0) return 0;
  await db
    .insert(contextDaily)
    .values(days.map((d) => ({ ...d, updatedAt: new Date() })))
    .onConflictDoUpdate({
      target: contextDaily.date,
      set: {
        tempMax: sql`excluded.temp_max`,
        tempMin: sql`excluded.temp_min`,
        precipMm: sql`excluded.precip_mm`,
        weatherCode: sql`excluded.weather_code`,
        updatedAt: sql`excluded.updated_at`,
      },
    });
  return days.length;
}

/** WMO code → an emoji and a word, for the Today header. */
export function describeWeather(code: number | null): { emoji: string; text: string } {
  if (code === null) return { emoji: "🌡️", text: "" };
  if (code === 0) return { emoji: "☀️", text: "Clear" };
  if (code <= 2) return { emoji: "🌤️", text: "Partly cloudy" };
  if (code === 3) return { emoji: "☁️", text: "Cloudy" };
  if (code <= 48) return { emoji: "🌫️", text: "Fog" };
  if (code <= 67 || (code >= 80 && code <= 82)) return { emoji: "🌧️", text: "Rain" };
  if (code <= 77 || code === 85 || code === 86) return { emoji: "🌨️", text: "Snow" };
  return { emoji: "⛈️", text: "Thunderstorm" };
}
