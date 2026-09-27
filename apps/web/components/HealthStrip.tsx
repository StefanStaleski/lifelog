import type { HealthResponse } from "@lifelog/shared";
import { relative } from "@/lib/format";

const NAMES: Record<string, string> = {
  heartbeat: "Phone",
  app_usage: "Screen time",
  unlock: "Unlocks",
  screen: "Screen on/off",
  steps: "Steps",
  activity: "Movement",
  geofence: "Places",
  stay: "Stops",
  checkin: "Check-in",
};

/** One pill per data source: green when it reported recently enough, amber when it went quiet. */
export function HealthStrip({ health, now }: { health: HealthResponse; now: Date }) {
  const sources = health.sources.filter((s) => s.source in NAMES);
  const problems = health.sources.filter((s) => s.last_error && s.source !== "ingest");
  if (sources.length === 0) {
    return <p className="text-sm text-stone-500">No data from the phone yet.</p>;
  }
  return (
    <div className="space-y-2">
      <ul
        className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:flex-wrap"
        aria-label="Data sources"
      >
        {sources.map((s) => (
          <li
            key={s.source}
            className="flex shrink-0 items-center gap-2 rounded-full bg-white px-3 py-1.5 text-sm ring-1 ring-stone-200/70 dark:bg-stone-900 dark:ring-stone-800"
            title={s.stale ? "Quiet for longer than usual" : "Reporting"}
          >
            <span
              className={`size-2 rounded-full ${s.stale ? "bg-attention" : "bg-good"}`}
              aria-hidden
            />
            <span className="font-medium">{NAMES[s.source]}</span>
            <span className="text-stone-500 dark:text-stone-400">
              {relative(new Date(s.last_event_at), now)}
            </span>
          </li>
        ))}
      </ul>
      {problems.map((p) => (
        <p
          key={p.source}
          className="rounded-2xl bg-attention-soft px-4 py-2 text-sm text-attention"
        >
          ⚠️ Phone reports: {p.last_error}
        </p>
      ))}
    </div>
  );
}
