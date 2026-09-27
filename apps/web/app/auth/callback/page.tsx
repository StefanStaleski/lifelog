"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createSupabaseBrowser } from "@/lib/supabase/client";

/** Landing page of the magic link: the session is in the URL fragment; store it and go to Today. */
export default function AuthCallbackPage() {
  const router = useRouter();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const supabase = createSupabaseBrowser();
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) router.replace("/");
      else setFailed(true);
    });
  }, [router]);

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 text-center">
      {failed ? (
        <div className="space-y-2">
          <p className="font-medium">That link didn&apos;t work.</p>
          <p className="text-sm text-stone-500">Links expire after 15 minutes and work once.</p>
          <a href="/login" className="font-medium text-accent">
            Get a new link
          </a>
        </div>
      ) : (
        <p className="text-stone-500">Signing you in…</p>
      )}
    </main>
  );
}
