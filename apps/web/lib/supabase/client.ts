"use client";

import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser client. @supabase/ssr always uses PKCE: requesting a magic link stores a verifier cookie
 * that /auth/callback needs, so the link has to be opened in the same browser.
 */
export function createSupabaseBrowser() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
