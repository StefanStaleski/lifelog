/** Shown instantly while a dashboard page renders on the server: panels shaped like the views. */
export default function Loading() {
  return (
    <div className="space-y-6" role="status" aria-label="Loading">
      <div className="flex items-center gap-3">
        <span className="hud-blink size-2 rounded-full bg-accent shadow-[0_0_10px] shadow-accent" />
        <span className="hud-label">Acquiring signal…</span>
      </div>
      <div className="skeleton h-9 w-2/3 max-w-md rounded-md" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="hud-panel space-y-3 p-4">
            <div className="skeleton h-3 w-24 rounded" />
            <div className="skeleton h-8 w-20 rounded" />
          </div>
        ))}
      </div>
      <div className="grid gap-3 lg:grid-cols-3">
        <div className="hud-panel p-4 lg:col-span-2">
          <div className="skeleton h-3 w-32 rounded" />
          <div className="skeleton mt-4 h-56 rounded-lg" />
        </div>
        <div className="hud-panel space-y-3 p-4">
          <div className="skeleton h-3 w-28 rounded" />
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="skeleton h-5 rounded" style={{ width: `${90 - i * 12}%` }} />
          ))}
        </div>
      </div>
    </div>
  );
}
