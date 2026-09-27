import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { devAuthBypass, isOwnerEmail } from "@/lib/owner";

export async function createSupabaseServer() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (toSet) => {
          try {
            toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // Server Components can't set cookies; the proxy refreshes the session instead.
          }
        },
      },
    },
  );
}

/** The signed-in owner's email, or null. Verified with Supabase Auth, not just read from the cookie. */
export async function getOwner(): Promise<string | null> {
  if (devAuthBypass()) return process.env.DASHBOARD_EMAIL ?? "dev@localhost";
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return null;
  const { data } = await (await createSupabaseServer()).auth.getUser();
  return isOwnerEmail(data.user?.email) ? data.user!.email! : null;
}
