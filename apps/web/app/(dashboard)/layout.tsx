import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { BottomNav, TopNav } from "@/components/Nav";
import { getOwner } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  if (!(await getOwner())) redirect("/login");
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-10 border-b border-accent/15 bg-stone-950/85 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
          <span className="flex items-center gap-2 font-mono text-sm tracking-[0.25em] text-stone-100 uppercase">
            <span
              className="hud-blink size-2 rounded-full bg-accent shadow-[0_0_10px] shadow-accent"
              aria-hidden
            />
            Lifelog
          </span>
          <TopNav />
          <form action="/auth/signout" method="post">
            <button className="rounded-md px-3 py-1.5 font-mono text-xs tracking-[0.15em] text-stone-500 uppercase hover:text-accent">
              Sign out
            </button>
          </form>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 pt-6 pb-28 sm:pb-12">{children}</main>
      <BottomNav />
    </div>
  );
}
