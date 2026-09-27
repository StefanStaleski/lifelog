import Link from "next/link";
import { DayRing, DayRingLegend } from "@/components/DayRing";
import { HealthStrip } from "@/components/HealthStrip";
import { Heatmap } from "@/components/Heatmap";
import { MiniMap } from "@/components/MiniMap";
import { Portrait360 } from "@/components/Portrait360";
import { Sparkline } from "@/components/Sparkline";
import { Chip } from "@/components/Stat";
import { Card } from "@/components/ui";
import { getDb } from "@/lib/db";
import {
  getAnomalies,
  getDaySlots,
  getFieldNotes,
  getKnownPlaces,
  getPatternOfLife,
  getSparklines,
  getStatus,
} from "@/lib/dossier";
import {
  clock,
  count,
  duration,
  ENERGY_EMOJI,
  FOCUS_EMOJI,
  km,
  longDate,
  MOOD_EMOJI,
  relative,
  shortDate,
  versus,
} from "@/lib/format";
import { METRICS, type MetricName, todayLocal } from "@/lib/metrics";
import { portraitInfo } from "@/lib/portrait";
import { getToday } from "@/lib/today";
import { describeWeather } from "@/lib/weather";

const PLACE_ICON = { home: "🏠", work: "💼", gym: "🏋️", other: "📍" } as const;

function show(m: MetricName, v: number | null | undefined) {
  if (v == null) return "–";
  const f = METRICS[m].format;
  if (f === "duration") return duration(v);
  if (f === "distance") return km(v);
  if (f === "score") return v.toFixed(1);
  return count(v);
}

function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-accent/10 py-2 last:border-0">
      <dt className="hud-label shrink-0">{k}</dt>
      <dd className="text-right text-sm text-stone-100">{children}</dd>
    </div>
  );
}

export default async function DossierPage() {
  const db = getDb();
  const now = new Date();
  const [t, status, portrait, slots, pattern, known, anomalies, notes, sparks] = await Promise.all([
    getToday(db, now),
    getStatus(db, now),
    portraitInfo(db),
    getDaySlots(db, todayLocal(now)),
    getPatternOfLife(db, 28, now),
    getKnownPlaces(db, now),
    getAnomalies(db, now),
    getFieldNotes(db, 6),
    getSparklines(db, now),
  ]);
  const name = process.env.DOSSIER_NAME || "Subject";
  const row = t.todayRow;
  const usual = (m: MetricName) => t.baseline[m]?.mean ?? null;
  const signalAgeMin = status.lastSignal
    ? (now.getTime() - status.lastSignal.getTime()) / 60_000
    : null;
  const live = signalAgeMin !== null && signalAgeMin < 45;
  const trackedDays = status.trackingSince
    ? Math.max(1, Math.ceil((now.getTime() - status.trackingSince.getTime()) / 86_400_000))
    : 0;
  const dayFraction = (() => {
    const [h, m] = clock(now).split(":").map(Number);
    return (h! * 60 + m!) / 1440;
  })();
  const phoneToday = slots.reduce((a, s) => a + s.phoneMin, 0);

  const vitals: {
    m: MetricName;
    label: string;
    value: number | null | undefined;
    note?: string;
  }[] = [
    { m: "screen_time_min", label: "Screen time · today", value: row?.screen_time_min },
    { m: "unlocks", label: "Unlocks · today", value: row?.unlocks },
    { m: "notifications", label: "Notifications · today", value: row?.notifications },
    { m: "steps", label: "Steps · today", value: row?.steps },
    { m: "sleep_min", label: "Sleep · last night", value: t.sleep?.durationMin },
    { m: "mood", label: "Mood · yesterday", value: t.yesterdayRow?.mood },
  ];

  return (
    <div className="grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
      {/* ── Identity column ───────────────────────────── */}
      <aside className="grid grid-cols-[minmax(0,120px)_minmax(0,1fr)] gap-3 self-start sm:grid-cols-[minmax(0,200px)_minmax(0,1fr)] lg:sticky lg:top-20 lg:grid-cols-1 lg:gap-4">
        {portrait.frames > 0 ? (
          <Portrait360 frames={portrait.frames} version={portrait.version} />
        ) : (
          <Link
            href="/profile"
            className="flex aspect-[3/4] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-accent/30 font-mono text-xs tracking-[0.2em] text-stone-500 uppercase hover:border-accent hover:text-accent"
          >
            <span className="text-3xl" aria-hidden>
              👤
            </span>
            Add portrait
          </Link>
        )}
        <section className="hud-panel p-4">
          <p className="hud-label">Subject</p>
          <h1 className="hud-glow mt-1 text-2xl font-semibold tracking-tight">{name}</h1>
          <p className="font-mono text-[10px] tracking-[0.2em] text-stone-500 uppercase">
            File LL-
            {status.trackingSince
              ? status.trackingSince.toISOString().slice(0, 10).replaceAll("-", "")
              : "PENDING"}
          </p>
          <dl className="mt-3">
            <Row k="Status">
              <span className="inline-flex items-center gap-2">
                <span
                  className={`size-2 rounded-full ${live ? "hud-blink bg-good" : "bg-attention"}`}
                  aria-hidden
                />
                {status.place ? `At ${status.place.name}` : "Location unknown"}
              </span>
            </Row>
            {status.place && <Row k="Since">{clock(status.place.since)}</Row>}
            <Row k="Last signal">
              {status.lastSignal ? relative(status.lastSignal, now) : "none yet"}
            </Row>
            <Row k="Device">
              {status.device ?? "–"}
              {status.battery != null && ` · ${status.battery}%${status.charging ? " ⚡" : ""}`}
            </Row>
            {t.weather?.tempMax != null && (
              <Row k="Weather">
                {describeWeather(t.weather.weatherCode).emoji} {Math.round(t.weather.tempMax)}° /{" "}
                {Math.round(t.weather.tempMin ?? t.weather.tempMax)}°
              </Row>
            )}
            <Row k="Tracked">
              {trackedDays ? `${trackedDays} day${trackedDays === 1 ? "" : "s"}` : "–"}
            </Row>
          </dl>
        </section>
      </aside>

      {/* ── Readouts ─────────────────────────────────── */}
      <div className="min-w-0 space-y-6">
        <header>
          <p className="hud-label">// Dossier · {longDate(t.today)}</p>
          <p className="mt-1 font-mono text-3xl text-stone-100 tabular-nums hud-glow">
            {clock(now)}
          </p>
        </header>

        <section className="space-y-2">
          <p className="hud-label">▍Sensors</p>
          <HealthStrip health={t.health} now={now} />
        </section>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {vitals.map((v) => {
            const cmp =
              v.m === "sleep_min" || v.m === "mood"
                ? versus(v.value ?? null, usual(v.m), METRICS[v.m].better)
                : null;
            return (
              <Link
                key={v.m}
                href={`/trends?m=${v.m}&r=30`}
                className="hud-panel block p-4 transition hover:border-accent/40"
              >
                <p className="hud-label flex items-center gap-2">
                  <span aria-hidden>{METRICS[v.m].emoji}</span>
                  {v.label}
                </p>
                <div className="mt-2 flex items-end justify-between gap-2">
                  <p className="hud-glow text-3xl font-semibold tabular-nums">
                    {v.m === "mood" && v.value ? MOOD_EMOJI[v.value] : show(v.m, v.value)}
                  </p>
                  <Sparkline values={sparks[v.m]} />
                </div>
                <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-stone-400">
                  {cmp && <Chip tone={cmp.tone}>{cmp.text}</Chip>}
                  usual {show(v.m, usual(v.m))}
                </p>
              </Link>
            );
          })}
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <Card title="24-hour trace · today">
            <DayRing
              slots={slots}
              nowFraction={dayFraction}
              center={{ value: duration(phoneToday), label: "on phone" }}
            />
            <DayRingLegend />
          </Card>
          <Card title="Anomalies">
            {anomalies.length === 0 ? (
              <p className="font-mono text-sm text-stone-400">
                <span className="text-good">●</span> Nothing unusual. Every signal is within your
                normal range.
              </p>
            ) : (
              <ul className="space-y-3">
                {anomalies.slice(0, 6).map((a) => {
                  const up = a.value > a.baseline.mean;
                  const better = METRICS[a.metric].better;
                  const good = better === null ? null : up === (better === "up");
                  return (
                    <li key={a.metric} className="flex items-start gap-3">
                      <span
                        className={`mt-1 size-2 shrink-0 rounded-full ${good === false ? "bg-attention" : good ? "bg-good" : "bg-accent"}`}
                        aria-hidden
                      />
                      <div className="text-sm">
                        <p className="text-stone-100">
                          {METRICS[a.metric].emoji} {METRICS[a.metric].label}{" "}
                          {a.metric === "sleep_min" ? "last night" : shortDate(a.date)}:{" "}
                          <strong>{show(a.metric, a.value)}</strong>
                        </p>
                        <p className="font-mono text-xs text-stone-400">
                          {a.ratio >= 1.15 || a.ratio <= 0.87
                            ? `${a.ratio.toFixed(1)}× usual`
                            : up
                              ? "higher than usual"
                              : "lower than usual"}{" "}
                          · usual {show(a.metric, a.baseline.mean)}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
            <p className="mt-4 text-xs text-stone-500">
              Flags finished days more than 1.5 standard deviations from your last 30 days.
            </p>
          </Card>
        </div>

        <Card title="Pattern of life · phone use">
          <Heatmap grid={pattern} />
        </Card>

        <Card
          title="Known locations"
          action={
            <Link href="/time" className="hud-label hover:text-accent">
              Edit ›
            </Link>
          }
        >
          {known.length === 0 ? (
            <p className="text-sm text-stone-400">
              No places yet.{" "}
              <Link href="/time" className="text-accent">
                Add home, work and the gym
              </Link>
              , or accept a suggestion.
            </p>
          ) : (
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,280px)]">
              <MiniMap
                places={known.map((k) => ({
                  id: k.id,
                  name: k.name,
                  kind: k.kind,
                  lat: k.lat,
                  lng: k.lng,
                  radius_m: k.radius_m,
                  archived: false,
                }))}
              />
              <ul className="space-y-2">
                {known.map((k) => (
                  <li key={k.id} className="rounded-lg bg-stone-950/60 p-3 ring-1 ring-accent/10">
                    <p className="flex items-center justify-between font-medium">
                      <span>
                        {PLACE_ICON[k.kind]} {k.name}
                      </span>
                      <span className="font-mono text-xs text-stone-400">
                        {duration(k.minutes)}
                      </span>
                    </p>
                    <p className="font-mono text-[11px] text-stone-500">
                      {k.visits} visit{k.visits === 1 ? "" : "s"} · 30 d · last{" "}
                      {k.last_seen ? relative(new Date(k.last_seen), now) : "never"}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>

        <div className="grid gap-4 xl:grid-cols-2">
          <Card title="Apps · today">
            {t.topApps.length === 0 ? (
              <p className="text-sm text-stone-400">No screen time yet today.</p>
            ) : (
              <ul className="space-y-2">
                {t.topApps.map((a, i) => (
                  <li key={a.label} className="flex items-center gap-3">
                    <span className="w-5 font-mono text-xs text-stone-500">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="flex-1 truncate">{a.label}</span>
                    <span className="font-mono text-xs text-stone-400">{duration(a.minutes)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title="Field notes">
            {notes.length === 0 ? (
              <p className="text-sm text-stone-400">No check-ins yet. The phone asks at 21:30.</p>
            ) : (
              <ul className="space-y-3">
                {notes.map((n) => (
                  <li key={n.date} className="border-l-2 border-accent/30 pl-3">
                    <p className="font-mono text-[11px] tracking-[0.15em] text-stone-500 uppercase">
                      {shortDate(n.date)}
                    </p>
                    <p
                      className="text-lg"
                      aria-label={`Mood ${n.mood}, energy ${n.energy}, focus ${n.focus}`}
                    >
                      {MOOD_EMOJI[n.mood]} {ENERGY_EMOJI[n.energy]} {FOCUS_EMOJI[n.focus]}
                      {n.tags.length > 0 && (
                        <span className="ml-2 font-mono text-xs text-stone-400">
                          #{n.tags.join(" #")}
                        </span>
                      )}
                    </p>
                    {n.note && <p className="text-sm text-stone-300 italic">“{n.note}”</p>}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
