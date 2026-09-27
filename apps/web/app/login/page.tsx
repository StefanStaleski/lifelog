"use client";

import { type FormEvent, useState } from "react";
import { createSupabaseBrowser } from "@/lib/supabase/client";

type State =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "sent"; email: string }
  | { kind: "error"; message: string };

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<State>({ kind: "idle" });

  async function send(e: FormEvent) {
    e.preventDefault();
    setState({ kind: "sending" });
    const { error } = await createSupabaseBrowser().auth.signInWithOtp({
      email: email.trim(),
      options: {
        shouldCreateUser: false,
        emailRedirectTo: `${window.location.origin}/auth/callback`,
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
        <p className="text-4xl" aria-hidden>
          🌿
        </p>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">Lifelog</h1>
        {state.kind === "sent" ? (
          <div className="mt-4 space-y-3">
            <p className="font-medium">Check your email ✉️</p>
            <p className="text-sm text-stone-500 dark:text-stone-400">
              If {state.email} can sign in, a link is on its way. Open it on any device, it signs
              you in there.
            </p>
            <button
              onClick={() => setState({ kind: "idle" })}
              className="text-sm font-medium text-accent"
            >
              Use a different email
            </button>
          </div>
        ) : (
          <form onSubmit={send} className="mt-4 space-y-4">
            <p className="text-sm text-stone-500 dark:text-stone-400">
              We&apos;ll email you a sign-in link. No password needed.
            </p>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full rounded-2xl border border-stone-300 bg-transparent px-4 py-3 outline-none focus:border-accent focus:ring-2 focus:ring-accent/30 dark:border-stone-700"
            />
            <button
              disabled={state.kind === "sending"}
              className="w-full rounded-xl bg-accent px-4 py-3 font-medium text-stone-950 transition hover:bg-accent/85 disabled:opacity-60"
            >
              {state.kind === "sending" ? "Sending…" : "Email me a link"}
            </button>
            {state.kind === "error" && <p className="text-sm text-attention">{state.message}</p>}
          </form>
        )}
      </div>
    </main>
  );
}
