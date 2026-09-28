import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import { devAuthBypass } from "@/lib/owner";

/**
 * Keeps the Supabase session cookie fresh and sends signed-out visitors to /login. This is only the
 * quick check; pages and API routes verify the owner themselves.
 */
export async function proxy(request: NextRequest) {
  if (devAuthBypass() || !process.env.NEXT_PUBLIC_SUPABASE_URL) return NextResponse.next();

  // Supabase sends the magic link to the site root when the requested redirect isn't allowed;
  // hand the code to the callback instead of dropping it on the way to /login.
  const code = request.nextUrl.searchParams.get("code");
  if (code) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/callback";
    url.search = "";
    url.searchParams.set("code", code);
    return NextResponse.redirect(url);
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (toSet) => {
          toSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          toSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );
  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    // Come back here after signing in (the OAuth consent page needs its authorization_id).
    const back = request.nextUrl.pathname + request.nextUrl.search;
    if (back !== "/") url.searchParams.set("next", back);
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  // Everything except the API (own auth), sign-in pages, OAuth metadata and static files.
  matcher: [
    "/((?!api/|login|auth/|\\.well-known/|_next/|favicon.ico|.*\\.(?:png|svg|ico|webmanifest)$).*)",
  ],
};
