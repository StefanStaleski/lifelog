import { Card, EmptyState } from "@/components/ui";
import { HealthStrip } from "@/components/HealthStrip";
import { Bar, Chip, Stat } from "@/components/Stat";
import { getDb } from "@/lib/db";
import {
  clock,
  count,
  duration,
  ENERGY_EMOJI,
  FOCUS_EMOJI,
  greeting,
  km,
  longDate,
  MOOD_EMOJI,
  versus,
} from "@/lib/format";
import { METRICS } from "@/lib/metrics";
import { getToday } from "@/lib/today";
import { describeWeather } from "@/lib/weather";

export default async function TodayPage() {
  const t = await getToday(getDb());
  const row = t.todayRow;
  const b = t.baseline;
  const usual = (m: keyof typeof b) => b[m]?.mean ?? null;

  const places = [
    { label: "Home", emoji: "🏠", min: row?.home_min ?? 0, color: "bg-accent" },
    { label: "Work", emoji: "💼", min: row?.work_min ?? 0, color: "bg-amber-500" },
    { label: "Gym", emoji: "🏋️", min: row?.gym_min ?? 0, color: "bg-emerald-500" },
    { label: "Elsewhere", emoji: "📍", min: row?.other_places_min ?? 0, color: "bg-fuchsia-500" },
  ].filter((p) => p.min > 0);
  const placesTotal = places.reduce((a, p) => a + p.min, 0);
  const maxApp = Math.max(1, ...t.topApps.map((a) => a.minutes));
  const confidence = t.sleep
    ? t.sleep.confidence >= 0.85
      ? "sure"
      : t.sleep.confidence >= 0.65
        ? "fairly sure"
        : "rough guess"
    : null;

  return (
    <div className="space-y-6">
      <header>
        <p className="text-stone-500 dark:text-stone-400">{longDate(t.today)}</p>
        <h1 className="text-3xl font-semibold tracking-tight">{greeting(t.now)} 👋</h1>
        {t.weather && t.weather.tempMax != null && (
          <p className="mt-1 text-stone-600 dark:text-stone-300">
            {describeWeather(t.weather.weatherCode).emoji}{" "}
            {describeWeather(t.weather.weatherCode).text}
            {" · "}
            {Math.round(t.weather.tempMax)}° / {Math.round(t.weather.tempMin ?? t.weather.tempMax)}°
            {t.weather.precipMm ? ` · ${t.weather.precipMm.toFixed(1)} mm rain` : ""}
          </p>
        )}
      </header>

      <HealthStrip health={t.health} now={t.now} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {t.sleep ? (
          <Stat
            emoji="😴"
            label="Last night"
            value={duration(t.sleep.durationMin)}
            chip={versus(t.sleep.durationMin, usual("sleep_min"), METRICS.sleep_min.better)}
            sub={`${clock(t.sleep.sleepStart)} → ${clock(t.sleep.wakeAt)} · ${confidence}`}
          />
        ) : (
          <Stat
            emoji="😴"
            label="Last night"
            value="–"
            sub="Shows up after your first unlock of the morning."
          />
        )}

        <Stat
          emoji="📱"
          label="Screen time so far"
          value={duration(row?.screen_time_min ?? 0)}
          sub={
            <>
              {count(row?.unlocks ?? 0)} unlocks
              {row?.notifications != null && <> · {count(row.notifications)} notifications</>} ·
              usual day {duration(usual("screen_time_min"))}
            </>
          }
        >
          <Bar value={row?.screen_time_min ?? 0} max={usual("screen_time_min") ?? 0} />
        </Stat>

        <Stat
          emoji="👟"
          label="Steps so far"
          value={count(row?.steps ?? 0)}
          sub={`${km(row?.distance_m ?? 0)} · usual day ${count(usual("steps"))}`}
        >
          <Bar value={row?.steps ?? 0} max={usual("steps") ?? 0} className="bg-good" />
        </Stat>

        <Card title="Evening check-in">
          {t.checkin ? (
            <div className="space-y-3">
              <div
                className="flex gap-4 text-3xl"
                aria-label={`Mood ${t.checkin.mood}, energy ${t.checkin.energy}, focus ${t.checkin.focus}`}
              >
                <span title="Mood">{MOOD_EMOJI[t.checkin.mood]}</span>
                <span title="Energy">{ENERGY_EMOJI[t.checkin.energy]}</span>
                <span title="Focus">{FOCUS_EMOJI[t.checkin.focus]}</span>
              </div>
              {t.checkin.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {t.checkin.tags.map((tag) => (
                    <Chip key={tag}>{tag}</Chip>
                  ))}
                </div>
              )}
              {t.checkin.note && (
                <p className="text-sm text-stone-600 italic dark:text-stone-300">
                  “{t.checkin.note}”
                </p>
              )}
            </div>
          ) : (
            <p className="text-stone-500 dark:text-stone-400">
              Not yet. Your phone will remind you at 21:30. 🌙
            </p>
          )}
        </Card>

        <Card title="Where the day went">
          {places.length === 0 ? (
            <p className="text-stone-500 dark:text-stone-400">No places yet today.</p>
          ) : (
            <div className="space-y-3">
              <div className="flex h-3 overflow-hidden rounded-full">
                {places.map((p) => (
                  <div
                    key={p.label}
                    className={p.color}
                    style={{ width: `${(p.min / placesTotal) * 100}%` }}
                  />
                ))}
              </div>
              <ul className="space-y-1.5 text-sm">
                {places.map((p) => (
                  <li key={p.label} className="flex justify-between">
                    <span>
                      <span aria-hidden>{p.emoji}</span> {p.label}
                    </span>
                    <span className="font-medium tabular-nums">{duration(p.min)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>

        <Card title="Most used today">
          {t.topApps.length === 0 ? (
            <EmptyState emoji="📱" title="Nothing yet" />
          ) : (
            <ul className="space-y-3">
              {t.topApps.map((a) => (
                <li key={a.label} className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="font-medium">{a.label}</span>
                    <span className="tabular-nums text-stone-500 dark:text-stone-400">
                      {duration(a.minutes)}
                    </span>
                  </div>
                  <Bar value={a.minutes} max={maxApp} />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {t.yesterdayRow && (
        <Card title="Yesterday">
          <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-stone-500 dark:text-stone-400">Screen time</dt>
              <dd className="text-lg font-semibold">{duration(t.yesterdayRow.screen_time_min)}</dd>
            </div>
            <div>
              <dt className="text-stone-500 dark:text-stone-400">Steps</dt>
              <dd className="text-lg font-semibold">{count(t.yesterdayRow.steps)}</dd>
            </div>
            <div>
              <dt className="text-stone-500 dark:text-stone-400">Unlocks</dt>
              <dd className="text-lg font-semibold">{count(t.yesterdayRow.unlocks)}</dd>
            </div>
            <div>
              <dt className="text-stone-500 dark:text-stone-400">Mood</dt>
              <dd className="text-lg font-semibold">
                {t.yesterdayRow.mood ? MOOD_EMOJI[t.yesterdayRow.mood] : "–"}
              </dd>
            </div>
          </dl>
        </Card>
      )}
    </div>
  );
}
