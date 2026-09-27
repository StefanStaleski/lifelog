import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import { devAuthBypass } from "@/lib/owner";

/**
 * Keeps the Supabase session cookie fresh and sends signed-out visitors to /login. This is only the
 * quick check; pages and API routes verify the owner themselves.
 */
export async function proxy(request: NextRequest) {
  if (devAuthBypass() || !process.env.NEXT_PUBLIC_SUPABASE_URL) return NextResponse.next();

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
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  // Everything except the API (own auth), sign-in pages and static files.
  matcher: ["/((?!api/|login|auth/|_next/|favicon.ico|.*\\.(?:png|svg|ico|webmanifest)$).*)"],
};
