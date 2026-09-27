"use client";

import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser client. Magic links use the implicit flow (the token is in the link itself), so a link
 * opened on another device than the one that asked for it still signs in.
 */
export function createSupabaseBrowser() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: { flowType: "implicit", detectSessionInUrl: true },
    },
  );
}
