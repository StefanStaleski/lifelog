import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { TOOLS } from "@/lib/mcp/tools";
import { devAuthBypass, isOwnerEmail } from "@/lib/owner";
import { createSupabaseServer } from "@/lib/supabase/server";
import { decide } from "./actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Authorize access · Lifelog" };

const SCOPES: Record<string, string> = {
  email: "Your email address, to confirm it's you",
  openid: "Your account id",
  profile: "Your name and profile",
  phone: "Your phone number",
  offline_access: "Stay connected (refresh tokens)",
};

type Details = {
  id: string;
  client: string;
  redirectUri: string;
  scopes: string[];
  email: string;
};

function Shell({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-md hud-panel p-7 sm:p-8">
        <p className="hud-label mb-1">▍OAuth · access request</p>
        {children}
      </div>
    </main>
  );
}

function Problem({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Shell>
      <h1 className="hud-glow mt-2 text-2xl font-semibold tracking-tight">{title}</h1>
      <div className="mt-3 text-sm text-stone-400">{children}</div>
      <a href="/" className="mt-6 inline-block text-sm font-medium text-accent">
        Back to the dashboard
      </a>
    </Shell>
  );
}

const isLoopback = (host: string) => ["localhost", "127.0.0.1", "[::1]"].includes(host);

function Consent({ d, error }: { d: Details; error: boolean }) {
  const host = (() => {
    try {
      return new URL(d.redirectUri).hostname;
    } catch {
      return d.redirectUri;
    }
  })();
  return (
    <Shell>
      <h1 className="hud-glow mt-2 text-2xl font-semibold tracking-tight">
        {d.client} wants to read your Lifelog
      </h1>
      <p className="mt-2 text-sm text-stone-400">
        Signed in as <span className="text-stone-200">{d.email}</span>
      </p>

      <dl className="mt-6 space-y-4 text-sm">
        <div>
          <dt className="hud-label">Sends you back to</dt>
          <dd className="mt-1 font-mono text-base text-stone-100">{host}</dd>
          {isLoopback(host) && (
            <p className="mt-2 rounded-lg bg-attention-soft px-3 py-2 text-attention">
              This is an app on this computer (a loopback address). Only continue if you just
              started the connection yourself, e.g. from Claude Code.
            </p>
          )}
        </div>
        {d.scopes.length > 0 && (
          <div>
            <dt className="hud-label">Account access</dt>
            <dd className="mt-1 space-y-1 text-stone-300">
              {d.scopes.map((s) => (
                <p key={s}>· {SCOPES[s] ?? s}</p>
              ))}
            </dd>
          </div>
        )}
        <div>
          <dt className="hud-label">Read-only tools</dt>
          <dd className="mt-1 text-stone-300">{TOOLS.map((t) => t.title).join(" · ")}</dd>
          <p className="mt-2 text-stone-500">
            It can read summaries of your days, sleep, places, apps and check-ins. It can&apos;t
            change or delete anything. Revoke it any time by removing the connector in Claude.
          </p>
        </div>
      </dl>

      {error && (
        <p className="mt-4 text-sm text-attention">
          That didn&apos;t go through. The request may have expired: start the connection again.
        </p>
      )}

      <form action={decide} className="mt-7 flex gap-3">
        <input type="hidden" name="authorization_id" value={d.id} />
        <button
          name="decision"
          value="deny"
          className="flex-1 rounded-xl border border-stone-700 px-4 py-3 font-medium text-stone-300 transition hover:border-stone-500"
        >
          Deny
        </button>
        <button
          name="decision"
          value="approve"
          className="flex-1 rounded-xl bg-accent px-4 py-3 font-medium text-stone-950 transition hover:bg-accent/85"
        >
          Allow
        </button>
      </form>
    </Shell>
  );
}

/**
 * Consent page of Supabase Auth's OAuth 2.1 server (its "authorization path"). Supabase sends the
 * browser here with `?authorization_id=` after a client such as claude.ai starts the flow.
 */
export default async function ConsentPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const id = typeof params.authorization_id === "string" ? params.authorization_id : null;
  const error = params.error === "decision_failed";

  // Local preview of the page (no Supabase Auth locally): /oauth/consent?preview=1
  if (devAuthBypass() && params.preview)
    return (
      <Consent
        error={error}
        d={{
          id: "preview",
          client: "Claude",
          redirectUri:
            params.preview === "loopback"
              ? "http://localhost:3118/callback"
              : "https://claude.ai/api/mcp/auth_callback",
          scopes: ["email"],
          email: process.env.DASHBOARD_EMAIL ?? "dev@localhost",
        }}
      />
    );

  if (!id)
    return (
      <Problem title="Nothing to authorize">
        This page opens when an app such as Claude asks to connect to Lifelog. Start from the app.
      </Problem>
    );

  const supabase = await createSupabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user)
    redirect(`/login?next=${encodeURIComponent(`/oauth/consent?authorization_id=${id}`)}`);

  if (!isOwnerEmail(auth.user.email))
    return (
      <Problem title="Not allowed">
        Only the owner of this Lifelog can connect apps to it.
        <form action={decide} className="mt-4">
          <input type="hidden" name="authorization_id" value={id} />
          <button name="decision" value="deny" className="font-medium text-accent">
            Decline the request
          </button>
        </form>
      </Problem>
    );

  const { data, error: detailsError } = await supabase.auth.oauth.getAuthorizationDetails(id);
  if (detailsError || !data)
    return (
      <Problem title="This request has expired">
        Authorization requests are only valid for a few minutes. Start the connection again from the
        app. {detailsError?.message ? `(${detailsError.message})` : null}
      </Problem>
    );
  // Already approved before: Supabase hands back the redirect with a fresh code straight away.
  if (!("authorization_id" in data)) redirect(data.redirect_url);

  return (
    <Consent
      error={error}
      d={{
        id: data.authorization_id,
        client: data.client.name || "An app",
        redirectUri: data.redirect_uri,
        scopes: data.scope.split(" ").filter(Boolean),
        email: auth.user.email ?? "",
      }}
    />
  );
}
