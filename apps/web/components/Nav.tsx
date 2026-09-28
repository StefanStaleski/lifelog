"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";

export const NAV = [
  { href: "/", label: "Dossier", icon: "🗂️" },
  { href: "/trends", label: "Trends", icon: "📈" },
  { href: "/time", label: "Time", icon: "🕰️" },
] as const;

/**
 * Rendered inside a Link: while its navigation is pending, a line runs along the top of the screen
 * and the link itself pulses.
 */
export function NavPending() {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  return (
    <>
      <span
        className="nav-progress fixed inset-x-0 top-0 z-50 h-0.5 bg-accent shadow-[0_0_12px] shadow-accent"
        aria-hidden
      />
      <span className="nav-pending absolute inset-0 rounded-md bg-accent/10" aria-hidden />
    </>
  );
}

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
          className="relative rounded-md px-3 py-1.5 font-mono text-xs tracking-[0.18em] text-stone-400 uppercase transition hover:text-stone-100 aria-[current=page]:bg-accent/10 aria-[current=page]:text-accent aria-[current=page]:ring-1 aria-[current=page]:ring-accent/40"
        >
          {item.label}
          <NavPending />
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
      className="fixed inset-x-0 bottom-0 z-10 border-t border-accent/20 bg-stone-950/95 pb-[env(safe-area-inset-bottom)] backdrop-blur sm:hidden"
      aria-label="Main"
    >
      <ul className="grid grid-cols-3">
        {NAV.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={isActive(pathname, item.href) ? "page" : undefined}
              className="relative flex flex-col items-center gap-0.5 py-2.5 font-mono text-[10px] tracking-[0.15em] text-stone-500 uppercase aria-[current=page]:text-accent"
            >
              <span className="text-xl leading-none" aria-hidden>
                {item.icon}
              </span>
              {item.label}
              <NavPending />
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
