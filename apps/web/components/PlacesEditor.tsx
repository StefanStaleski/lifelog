"use client";

import dynamic from "next/dynamic";
import { useState, useTransition } from "react";
import { dismissSuggestion, savePlace, setArchived } from "@/app/(dashboard)/time/actions";
import type { PlaceDto } from "@/lib/places";
import type { Suggestion } from "@/lib/suggestions";

// Leaflet touches `window`, so the map only renders in the browser.
const PlacesMap = dynamic(() => import("./PlacesMap"), {
  ssr: false,
  loading: () => (
    <div className="h-80 w-full animate-pulse rounded-2xl bg-stone-100 sm:h-96 dark:bg-stone-800" />
  ),
});

const KINDS = [
  { value: "home", label: "🏠 Home" },
  { value: "work", label: "💼 Work" },
  { value: "gym", label: "🏋️ Gym" },
  { value: "other", label: "📍 Other" },
] as const;

type Draft = {
  id: string | null;
  name: string;
  kind: PlaceDto["kind"];
  lat: number;
  lng: number;
  radius_m: number;
};

const SUGGESTION_TITLE: Record<Suggestion["kind"], string> = {
  home: "🏠 Looks like home",
  work: "💼 Looks like work",
  other: "📍 A place you go often",
};
const DEFAULT_NAME: Record<Suggestion["kind"], string> = { home: "Home", work: "Work", other: "" };

export function PlacesEditor({
  places,
  suggestions = [],
}: {
  places: PlaceDto[];
  suggestions?: Suggestion[];
}) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [focus, setFocus] = useState<[number, number] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const pick = (lat: number, lng: number) =>
    setDraft((d) => ({
      id: d?.id ?? null,
      name: d?.name ?? "",
      kind: d?.kind ?? "home",
      radius_m: d?.radius_m ?? 120,
      lat,
      lng,
    }));

  const useMyLocation = () => {
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        pick(p.coords.latitude, p.coords.longitude);
        setFocus([p.coords.latitude, p.coords.longitude]);
      },
      () => setError("Couldn't get your location. Tap the map instead."),
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  };

  const save = () =>
    draft &&
    start(async () => {
      const { id, ...fields } = draft;
      const res = await savePlace(id, { ...fields, name: fields.name.trim() });
      if (res.ok) setDraft(null);
      else setError(res.error);
    });

  const active = places.filter((p) => !p.archived);
  const archived = places.filter((p) => p.archived);

  return (
    <div className="space-y-4">
      {suggestions.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium">Suggested for you</p>
          <ul className="space-y-2">
            {suggestions.map((s) => (
              <li
                key={`${s.lat},${s.lng}`}
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-stone-50 p-3 dark:bg-stone-800/60"
              >
                <button className="text-left" onClick={() => setFocus([s.lat, s.lng])}>
                  <span className="block font-medium">{SUGGESTION_TITLE[s.kind]}</span>
                  <span className="text-sm text-stone-500 dark:text-stone-400">{s.why}</span>
                </button>
                <span className="flex gap-2">
                  <button
                    onClick={() => start(async () => void (await dismissSuggestion(s.lat, s.lng)))}
                    className="rounded-full px-3 py-1.5 text-sm text-stone-500 hover:bg-stone-200 dark:hover:bg-stone-700"
                  >
                    Not a place
                  </button>
                  <button
                    onClick={() => {
                      setDraft({
                        id: null,
                        name: DEFAULT_NAME[s.kind],
                        kind: s.kind,
                        lat: s.lat,
                        lng: s.lng,
                        radius_m: s.radius_m,
                      });
                      setFocus([s.lat, s.lng]);
                    }}
                    className="rounded-full bg-stone-900 px-3 py-1.5 text-sm font-medium text-white dark:bg-stone-100 dark:text-stone-900"
                  >
                    {s.kind === "other" ? "Name it" : `Add as ${DEFAULT_NAME[s.kind]}`}
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <PlacesMap
        places={places}
        suggestions={suggestions}
        draft={draft}
        focus={focus}
        onPick={pick}
      />
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-stone-500 dark:text-stone-400">Tap the map to place a pin, or</span>
        <button
          onClick={useMyLocation}
          className="rounded-full bg-stone-100 px-3 py-1.5 font-medium hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700"
        >
          📍 Use my location
        </button>
      </div>

      {draft && (
        <div className="space-y-4 rounded-2xl bg-accent-soft p-4">
          <p className="font-medium">{draft.id ? "Edit place" : "New place"}</p>
          <label className="block space-y-1 text-sm">
            <span className="text-stone-600 dark:text-stone-300">Name</span>
            <input
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              placeholder="e.g. Home, Office, Gym"
              maxLength={60}
              className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2 outline-none focus:border-accent dark:border-stone-700 dark:bg-stone-900"
            />
          </label>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Kind">
            {KINDS.map((k) => (
              <button
                key={k.value}
                role="radio"
                aria-checked={draft.kind === k.value}
                onClick={() => setDraft({ ...draft, kind: k.value })}
                className="rounded-full bg-white px-3 py-1.5 text-sm ring-1 ring-stone-200 aria-checked:bg-stone-900 aria-checked:text-white dark:bg-stone-900 dark:ring-stone-700 dark:aria-checked:bg-stone-100 dark:aria-checked:text-stone-900"
              >
                {k.label}
              </button>
            ))}
          </div>
          <label className="block space-y-1 text-sm">
            <span className="text-stone-600 dark:text-stone-300">
              Size: <strong>{draft.radius_m} m</strong> around the pin
            </span>
            <input
              type="range"
              min={50}
              max={500}
              step={10}
              value={draft.radius_m}
              onChange={(e) => setDraft({ ...draft, radius_m: Number(e.target.value) })}
              className="w-full accent-(--color-accent)"
            />
          </label>
          <div className="flex gap-2">
            <button
              onClick={save}
              disabled={pending || !draft.name.trim()}
              className="rounded-full bg-stone-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-stone-100 dark:text-stone-900"
            >
              {pending ? "Saving…" : "Save place"}
            </button>
            <button
              onClick={() => setDraft(null)}
              className="rounded-full px-4 py-2 text-sm text-stone-600 dark:text-stone-300"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      {error && <p className="text-sm text-attention">{error}</p>}

      {active.length === 0 && !draft ? (
        <p className="text-sm text-stone-500 dark:text-stone-400">
          No places yet. Add home first, then work and the gym. Spots where you spend time also show
          up here as suggestions after a few days.
        </p>
      ) : (
        <ul className="divide-y divide-stone-100 dark:divide-stone-800">
          {active.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-2 py-2.5">
              <button
                className="text-left"
                onClick={() => {
                  setDraft({
                    id: p.id,
                    name: p.name,
                    kind: p.kind,
                    lat: p.lat,
                    lng: p.lng,
                    radius_m: p.radius_m,
                  });
                  setFocus([p.lat, p.lng]);
                }}
              >
                <span className="font-medium">{p.name}</span>
                <span className="ml-2 text-sm text-stone-500 dark:text-stone-400">
                  {KINDS.find((k) => k.value === p.kind)?.label} · {p.radius_m} m
                </span>
              </button>
              <button
                onClick={() => start(async () => void (await setArchived(p.id, true)))}
                className="rounded-full px-3 py-1 text-sm text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800"
              >
                Archive
              </button>
            </li>
          ))}
        </ul>
      )}
      {archived.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-stone-500">Archived ({archived.length})</summary>
          <ul className="mt-2 space-y-1">
            {archived.map((p) => (
              <li key={p.id} className="flex items-center justify-between">
                <span>{p.name}</span>
                <button
                  onClick={() => start(async () => void (await setArchived(p.id, false)))}
                  className="text-accent"
                >
                  Restore
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
      <p className="text-xs text-stone-500 dark:text-stone-400">
        The phone picks up changes within half an hour. Visits count from when you arrive; past days
        aren&apos;t re-sorted.
      </p>
    </div>
  );
}
