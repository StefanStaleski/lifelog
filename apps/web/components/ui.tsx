import type { ReactNode } from "react";

/** Rounded card with an optional small-caps title: the building block of every view. */
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
    <section
      className={`min-w-0 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-stone-200/70 sm:p-6 dark:bg-stone-900 dark:ring-stone-800 ${className}`}
    >
      {(title || action) && (
        <div className="mb-4 flex items-center justify-between gap-3">
          {title && (
            <h2 className="text-xs font-semibold tracking-widest text-accent uppercase">{title}</h2>
          )}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function PageHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <header className="mb-6">
      <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
      {subtitle && <p className="mt-1 text-stone-500 dark:text-stone-400">{subtitle}</p>}
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
      <span className="text-4xl" aria-hidden>
        {emoji}
      </span>
      <p className="font-medium">{title}</p>
      {children && (
        <div className="max-w-sm text-sm text-stone-500 dark:text-stone-400">{children}</div>
      )}
    </div>
  );
}
