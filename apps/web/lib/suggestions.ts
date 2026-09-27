import { LOCAL_TIME_ZONE } from "@lifelog/shared";
import { dismissedSuggestions, locationStays } from "@lifelog/shared/db";
import { gte } from "drizzle-orm";
import type { Db } from "./db";
import { listPlaces, type PlaceDto } from "./places";

export type StayInput = { arrived: Date; left: Date; lat: number; lng: number };

export type Suggestion = {
  lat: number;
  lng: number;
  kind: "home" | "work" | "other";
  radius_m: number;
  minutes: number;
  visits: number;
  /** Plain-words reason, e.g. "14 h over 5 visits, mostly at night". */
  why: string;
};

const SAME_SPOT_M = 200;
const STEP_MIN = 15;

export function distanceM(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const r = (d: number) => (d * Math.PI) / 180;
  const a =
    Math.sin(r(bLat - aLat) / 2) ** 2 +
    Math.cos(r(aLat)) * Math.cos(r(bLat)) * Math.sin(r(bLng - aLng) / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(a));
}

const partsFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: LOCAL_TIME_ZONE,
  hour: "2-digit",
  hour12: false,
  weekday: "short",
});
function localHourAndWeekday(d: Date): { hour: number; weekend: boolean } {
  const parts = partsFmt.formatToParts(d);
  const hour = Number(parts.find((p) => p.type === "hour")?.value) % 24;
  const wd = parts.find((p) => p.type === "weekday")?.value ?? "";
  return { hour, weekend: wd === "Sat" || wd === "Sun" };
}

/** Minutes of a stay at night (22–07 local) and during weekday office hours (Mon–Fri 9–17). */
function classify(s: StayInput) {
  let night = 0;
  let office = 0;
  const end = Math.min(s.left.getTime(), s.arrived.getTime() + 3 * 86_400_000);
  for (let t = s.arrived.getTime(); t < end; t += STEP_MIN * 60_000) {
    const { hour, weekend } = localHourAndWeekday(new Date(t));
    if (hour >= 22 || hour < 7) night += STEP_MIN;
    else if (!weekend && hour >= 9 && hour < 17) office += STEP_MIN;
  }
  return { night, office };
}

const hours = (m: number) => (m >= 90 ? `${Math.round(m / 60)} h` : `${Math.round(m)} min`);

/**
 * Groups stays outside named places into spots and proposes the ones worth naming. At most one
 * home and one work suggestion, and none for kinds that already have a place.
 */
export function suggestPlaces(
  stays: StayInput[],
  places: PlaceDto[],
  dismissed: { lat: number; lng: number }[],
): Suggestion[] {
  type Cluster = {
    lat: number;
    lng: number;
    minutes: number;
    visits: number;
    night: number;
    office: number;
  };
  const clusters: Cluster[] = [];
  const byLength = [...stays].sort(
    (a, b) => b.left.getTime() - b.arrived.getTime() - (a.left.getTime() - a.arrived.getTime()),
  );
  for (const s of byLength) {
    const minutes = (s.left.getTime() - s.arrived.getTime()) / 60_000;
    if (minutes <= 0) continue;
    const { night, office } = classify(s);
    const c = clusters.find((c) => distanceM(c.lat, c.lng, s.lat, s.lng) <= SAME_SPOT_M);
    if (c) {
      // Centre weighted by time spent, so long stays anchor the spot.
      c.lat = (c.lat * c.minutes + s.lat * minutes) / (c.minutes + minutes);
      c.lng = (c.lng * c.minutes + s.lng * minutes) / (c.minutes + minutes);
      c.minutes += minutes;
      c.visits += 1;
      c.night += night;
      c.office += office;
    } else {
      clusters.push({ lat: s.lat, lng: s.lng, minutes, visits: 1, night, office });
    }
  }

  const active = places.filter((p) => !p.archived);
  const hasKind = (k: string) => active.some((p) => p.kind === k);
  const covered = (c: Cluster) =>
    active.some((p) => distanceM(p.lat, p.lng, c.lat, c.lng) <= p.radius_m + 100) ||
    dismissed.some((d) => distanceM(d.lat, d.lng, c.lat, c.lng) <= 150);

  const candidates = clusters
    .filter((c) => (c.minutes >= 120 || c.visits >= 3) && !covered(c))
    .sort((a, b) => b.minutes - a.minutes);

  let homeTaken = hasKind("home");
  let workTaken = hasKind("work");
  const out: Suggestion[] = [];
  for (const c of candidates) {
    let kind: Suggestion["kind"] = "other";
    let reason = "you come back here";
    if (!homeTaken && c.night / c.minutes >= 0.4) {
      kind = "home";
      homeTaken = true;
      reason = "mostly at night";
    } else if (!workTaken && c.office / c.minutes >= 0.5) {
      kind = "work";
      workTaken = true;
      reason = "mostly on weekdays, 9 to 5";
    }
    out.push({
      lat: Math.round(c.lat * 1000) / 1000,
      lng: Math.round(c.lng * 1000) / 1000,
      kind,
      radius_m: kind === "work" ? 150 : kind === "home" ? 120 : 100,
      minutes: Math.round(c.minutes),
      visits: c.visits,
      why: `${hours(c.minutes)} over ${c.visits} visit${c.visits === 1 ? "" : "s"}, ${reason}`,
    });
    if (out.length === 5) break;
  }
  return out;
}

/** Suggestions from the last 30 days of stays. */
export async function getSuggestions(db: Db, now = new Date()): Promise<Suggestion[]> {
  const since = new Date(now.getTime() - 30 * 86_400_000);
  const [stays, places, dismissed] = await Promise.all([
    db.select().from(locationStays).where(gte(locationStays.arrivedAt, since)),
    listPlaces(db),
    db.select().from(dismissedSuggestions),
  ]);
  return suggestPlaces(
    stays.map((s) => ({ arrived: s.arrivedAt, left: s.leftAt, lat: s.lat, lng: s.lng })),
    places,
    dismissed,
  );
}
