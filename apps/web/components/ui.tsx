import type { ReactNode } from "react";

/** HUD panel with bracketed corners and an optional mono title: the building block of every view. */
export function Card({
  title,
  action,
  children,
  className = "",
}: {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`hud-panel min-w-0 p-5 sm:p-6 ${className}`}>
      {(title || action) && (
        <div className="mb-4 flex items-center justify-between gap-3">
          {title && <h2 className="hud-label">▍{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function PageHeader({
  title,
  subtitle,
  code,
}: {
  title: string;
  subtitle?: string;
  code?: string;
}) {
  return (
    <header className="mb-6">
      {code && <p className="hud-label mb-1">{code}</p>}
      <h1 className="hud-glow text-3xl font-semibold tracking-tight">{title}</h1>
      {subtitle && <p className="mt-1 text-stone-400">{subtitle}</p>}
    </header>
  );
}

export function EmptyState({
  emoji,
  title,
  children,
}: {
  emoji: string;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 py-8 text-center">
      <span className="text-4xl opacity-80" aria-hidden>
        {emoji}
      </span>
      <p className="font-mono text-sm tracking-wide text-stone-300 uppercase">{title}</p>
      {children && <div className="max-w-sm text-sm text-stone-400">{children}</div>}
    </div>
  );
}
