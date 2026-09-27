import { createHash, timingSafeEqual } from "node:crypto";
import { getDb } from "@/lib/db";
import { refreshWeather } from "@/lib/weather";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const digest = (v: string) => createHash("sha256").update(v).digest();

/** Vercel Cron (vercel.json) calls this daily with `Authorization: Bearer $CRON_SECRET`. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const given = /^Bearer (.+)$/.exec(req.headers.get("authorization") ?? "")?.[1];
  if (!secret || !given || !timingSafeEqual(digest(given), digest(secret))) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const weatherDays = await refreshWeather(getDb());
  return Response.json({ ok: true, weatherDays });
}
