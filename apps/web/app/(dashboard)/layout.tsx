import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { BottomNav, TopNav } from "@/components/Nav";
import { getOwner } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  if (!(await getOwner())) redirect("/login");
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-10 border-b border-stone-200/70 bg-stone-50/90 backdrop-blur dark:border-stone-800 dark:bg-stone-950/90">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
          <span className="text-lg font-semibold tracking-tight">Lifelog</span>
          <TopNav />
          <form action="/auth/signout" method="post">
            <button className="rounded-full px-3 py-1.5 text-sm text-stone-500 hover:bg-stone-200/70 dark:text-stone-400 dark:hover:bg-stone-800">
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
