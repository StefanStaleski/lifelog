"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export const NAV = [
  { href: "/", label: "Today", icon: "☀️" },
  { href: "/trends", label: "Trends", icon: "📈" },
  { href: "/time", label: "Time", icon: "🕰️" },
] as const;

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

/** Top tabs on wide screens. */
export function TopNav() {
  const pathname = usePathname();
  return (
    <nav className="hidden gap-1 sm:flex" aria-label="Main">
      {NAV.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={isActive(pathname, item.href) ? "page" : undefined}
          className="rounded-full px-4 py-2 text-sm font-medium text-stone-600 transition hover:bg-stone-200/70 aria-[current=page]:bg-stone-900 aria-[current=page]:text-white dark:text-stone-300 dark:hover:bg-stone-800 dark:aria-[current=page]:bg-stone-100 dark:aria-[current=page]:text-stone-900"
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

/** Thumb-reachable tab bar on phones. */
export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-10 border-t border-stone-200 bg-stone-50/95 pb-[env(safe-area-inset-bottom)] backdrop-blur sm:hidden dark:border-stone-800 dark:bg-stone-950/95"
      aria-label="Main"
    >
      <ul className="grid grid-cols-3">
        {NAV.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={isActive(pathname, item.href) ? "page" : undefined}
              className="flex flex-col items-center gap-0.5 py-2.5 text-xs font-medium text-stone-500 aria-[current=page]:text-stone-900 dark:text-stone-400 dark:aria-[current=page]:text-white"
            >
              <span className="text-xl leading-none" aria-hidden>
                {item.icon}
              </span>
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
