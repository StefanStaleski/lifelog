"use client";

import { type FormEvent, useState } from "react";
import { createSupabaseBrowser } from "@/lib/supabase/client";

export const MIN_PASSWORD_LENGTH = 12;

/** Sets or changes the password for signing in without an email link. */
export function PasswordForm() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (password.length < MIN_PASSWORD_LENGTH)
      return setStatus({ ok: false, text: `Use at least ${MIN_PASSWORD_LENGTH} characters.` });
    if (password !== confirm) return setStatus({ ok: false, text: "The passwords don't match." });
    setBusy(true);
    const { error } = await createSupabaseBrowser().auth.updateUser({ password });
    setBusy(false);
    if (error) return setStatus({ ok: false, text: error.message });
    setPassword("");
    setConfirm("");
    setStatus({ ok: true, text: "Password saved. You can sign in with it now." });
  }

  const field =
    "w-full rounded-md border border-stone-700 bg-transparent px-3 py-2 outline-none focus:border-accent focus:ring-2 focus:ring-accent/30";
  return (
    <form onSubmit={save} className="max-w-sm space-y-3">
      <input
        type="password"
        autoComplete="new-password"
        placeholder="New password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className={field}
      />
      <input
        type="password"
        autoComplete="new-password"
        placeholder="Repeat it"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        className={field}
      />
      <button
        disabled={busy}
        className="rounded-md bg-accent px-4 py-2 font-mono text-xs tracking-[0.15em] text-stone-950 uppercase hover:bg-accent/85 disabled:opacity-50"
      >
        {busy ? "Saving…" : "Save password"}
      </button>
      {status && (
        <p className={`font-mono text-xs ${status.ok ? "text-accent" : "text-attention"}`}>
          {status.text}
        </p>
      )}
      <p className="text-sm text-stone-400">
        At least {MIN_PASSWORD_LENGTH} characters. The email link keeps working as a backup.
      </p>
    </form>
  );
}
