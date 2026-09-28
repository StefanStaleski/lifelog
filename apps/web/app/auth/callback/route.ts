import { NextResponse } from "next/server";
import { isOwnerEmail, safeNextPath } from "@/lib/owner";
import { createSupabaseServer } from "@/lib/supabase/server";

/**
 * Landing page of the magic link. @supabase/ssr always uses PKCE, so the link carries a `code` that
 * is exchanged here for a session cookie, using the verifier cookie set when the link was requested
 * (so the link works in the browser that asked for it).
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const fail = (error: string) => {
    const to = new URL("/login", url.origin);
    to.searchParams.set("error", error);
    return NextResponse.redirect(to, { status: 303 });
  };

  const code = url.searchParams.get("code");
  if (!code) return fail(url.searchParams.get("error_code") ?? "missing_code");

  const supabase = await createSupabaseServer();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return fail(error.code ?? "exchange_failed");
  if (!isOwnerEmail(data.user?.email)) {
    await supabase.auth.signOut();
    return fail("not_owner");
  }
  const next = safeNextPath(url.searchParams.get("next"));
  return NextResponse.redirect(new URL(next, url.origin), { status: 303 });
}
