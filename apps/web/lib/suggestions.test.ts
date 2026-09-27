import { describe, expect, it } from "vitest";
import type { PlaceDto } from "./places";
import { type StayInput, suggestPlaces } from "./suggestions";

// Local = UTC+2 in September.
const stay = (lat: number, lng: number, from: string, to: string): StayInput => ({
  lat,
  lng,
  arrived: new Date(from),
  left: new Date(to),
});
const HOME = [41.998, 21.425] as const;
const OFFICE = [41.9965, 21.4314] as const;
const CAFE = [41.9905, 21.44] as const;

// A week: nights at home (20:00Z–05:30Z = 22:00–07:30 local), weekdays at the office, café twice.
const week: StayInput[] = [];
for (let d = 21; d <= 27; d++) {
  week.push(
    stay(
      HOME[0],
      HOME[1] + (d % 2) * 0.001,
      `2026-09-${d - 1}T20:00:00Z`,
      `2026-09-${d}T05:30:00Z`,
    ),
  );
  if (d <= 25)
    week.push(stay(OFFICE[0], OFFICE[1], `2026-09-${d}T07:00:00Z`, `2026-09-${d}T15:00:00Z`));
}
week.push(stay(CAFE[0], CAFE[1], "2026-09-26T09:00:00Z", "2026-09-26T10:30:00Z"));
week.push(stay(CAFE[0], CAFE[1], "2026-09-27T09:00:00Z", "2026-09-27T10:00:00Z"));

const place = (kind: PlaceDto["kind"], lat: number, lng: number): PlaceDto => ({
  id: kind,
  name: kind,
  kind,
  lat,
  lng,
  radius_m: 120,
  archived: false,
});

describe("place suggestions", () => {
  it("finds home by the nights, work by weekday hours, and a regular café", () => {
    const s = suggestPlaces(week, [], []);
    expect(s.map((x) => x.kind)).toEqual(["home", "work", "other"]);
    expect(s[0]).toMatchObject({ lat: 41.998, visits: 7, radius_m: 120 });
    expect(s[0]!.why).toMatch(/^\d+ h over 7 visits, mostly at night$/);
    expect(s[1]).toMatchObject({
      lat: 41.997,
      lng: 21.431,
      visits: 5,
      why: "40 h over 5 visits, mostly on weekdays, 9 to 5",
    });
    expect(s[2]).toMatchObject({ kind: "other", visits: 2 });
  });

  it("skips spots already covered by a place, kinds already set, and dismissed spots", () => {
    const s = suggestPlaces(
      week,
      [place("home", HOME[0], HOME[1])],
      [{ lat: CAFE[0], lng: CAFE[1] }],
    );
    expect(s.map((x) => x.kind)).toEqual(["work"]);
  });

  it("ignores one-off short stops", () => {
    expect(
      suggestPlaces([stay(42.01, 21.4, "2026-09-26T09:00:00Z", "2026-09-26T09:40:00Z")], [], []),
    ).toEqual([]);
  });
});
