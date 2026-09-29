"use client";

import { type FormEvent, useEffect, useState } from "react";
import { safeNextPath } from "@/lib/owner";
import { createSupabaseBrowser } from "@/lib/supabase/client";

type State =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "sent"; email: string }
  | { kind: "error"; message: string };

/** `?next=` from the proxy (e.g. the OAuth consent page), checked to stay on this site. */
const nextPath = () => safeNextPath(new URLSearchParams(window.location.search).get("next"));

const OTHER_BROWSER =
  "Open the link in the same browser you requested it from, or get a new one here.";
/** Why /auth/callback sent us back here (`?error=`). */
const CALLBACK_ERRORS: Record<string, string> = {
  not_owner: "That account can't open this dashboard.",
  otp_expired: "That link has expired or was already used. Get a new one.",
  flow_state_expired: "That link has expired. Get a new one.",
  flow_state_not_found: OTHER_BROWSER,
  bad_code_verifier: OTHER_BROWSER,
  pkce_code_verifier_not_found: OTHER_BROWSER,
};

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"password" | "link">("password");
  const [state, setState] = useState<State>({ kind: "idle" });

  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("error");
    if (!code) return;
    const message = CALLBACK_ERRORS[code] ?? "That link didn't work. Get a new one.";
    setState({ kind: "error", message });
  }, []);

  async function signIn(e: FormEvent) {
    e.preventDefault();
    setState({ kind: "sending" });
    const { error } = await createSupabaseBrowser().auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error) {
      const wrong = /invalid login credentials/i.test(error.message);
      setState({ kind: "error", message: wrong ? "Wrong email or password." : error.message });
    } else {
      // Full load so the server sees the new session cookie.
      window.location.assign(nextPath());
    }
  }

  async function send(e: FormEvent) {
    e.preventDefault();
    setState({ kind: "sending" });
    const { error } = await createSupabaseBrowser().auth.signInWithOtp({
      email: email.trim(),
      options: {
        shouldCreateUser: false,
        emailRedirectTo:
          nextPath() === "/"
            ? `${window.location.origin}/auth/callback`
            : `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath())}`,
      },
    });
    // Same answer whether or not the address is allowed, so the page doesn't reveal who can sign in.
    if (error && !/signups not allowed|user not found/i.test(error.message)) {
      setState({ kind: "error", message: error.message });
    } else {
      setState({ kind: "sent", email: email.trim() });
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-sm hud-panel p-8">
        <img src="/mark.svg" alt="" width={56} height={56} className="rounded-xl" />
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">Lifelog</h1>
        {state.kind === "sent" ? (
          <div className="mt-4 space-y-3">
            <p className="font-medium">Check your email ✉️</p>
            <p className="text-sm text-stone-500 dark:text-stone-400">
              If {state.email} can sign in, a link is on its way. Open it in this browser.
            </p>
            <button
              onClick={() => setState({ kind: "idle" })}
              className="text-sm font-medium text-accent"
            >
              Use a different email
            </button>
          </div>
        ) : (
          <form onSubmit={mode === "password" ? signIn : send} className="mt-4 space-y-4">
            {mode === "link" && (
              <p className="text-sm text-stone-500 dark:text-stone-400">
                We&apos;ll email you a sign-in link (at most 2 an hour).
              </p>
            )}
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full rounded-2xl border border-stone-300 bg-transparent px-4 py-3 outline-none focus:border-accent focus:ring-2 focus:ring-accent/30 dark:border-stone-700"
            />
            {mode === "password" && (
              <input
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                className="w-full rounded-2xl border border-stone-300 bg-transparent px-4 py-3 outline-none focus:border-accent focus:ring-2 focus:ring-accent/30 dark:border-stone-700"
              />
            )}
            <button
              disabled={state.kind === "sending"}
              className="w-full rounded-xl bg-accent px-4 py-3 font-medium text-stone-950 transition hover:bg-accent/85 disabled:opacity-60"
            >
              {mode === "password"
                ? state.kind === "sending"
                  ? "Signing in…"
                  : "Sign in"
                : state.kind === "sending"
                  ? "Sending…"
                  : "Email me a link"}
            </button>
            {state.kind === "error" && <p className="text-sm text-attention">{state.message}</p>}
            <button
              type="button"
              onClick={() => {
                setMode(mode === "password" ? "link" : "password");
                setState({ kind: "idle" });
              }}
              className="text-sm font-medium text-accent"
            >
              {mode === "password" ? "No password yet? Email me a link" : "Use my password"}
            </button>
            {mode === "link" && (
              <p className="text-xs text-stone-500">
                Once you&apos;re in, set a password on the Profile page.
              </p>
            )}
          </form>
        )}
      </div>
    </main>
  );
}
