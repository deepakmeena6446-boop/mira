"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { api } from "@/lib/api-client";

/** "Already have an account?": a one-time sign-in link by email (no password). */
export function EmailSignIn() {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "sent" | "error">("idle");
  const [message, setMessage] = useState("");
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="mt-3 min-h-11 text-sm font-bold text-accent">
        Already have an account? Sign in with email
      </button>
    );
  }
  if (state === "sent") {
    return (
      <p role="status" className="mt-4 rounded-2xl bg-surface px-4 py-3 text-sm">
        <strong>Check your email.</strong> If an account uses {email.trim()}, a sign-in link is on its way. Open it on this phone.
      </p>
    );
  }
  return (
    <form
      className="mt-4 w-full text-left"
      onSubmit={async (e) => {
        e.preventDefault();
        setState("busy");
        const r = await api("/api/auth/email", { body: { email: email.trim() } });
        if (r.ok) setState("sent");
        else {
          setMessage(r.message);
          setState("error");
        }
      }}
    >
      <label htmlFor="signin-email" className="block text-sm font-bold">
        Your email
      </label>
      <input id="signin-email" type="email" inputMode="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1 w-full min-h-12 rounded-2xl border border-line bg-surface px-4 outline-none focus:border-accent" />
      {state === "error" ? <p className="mt-2 text-sm font-semibold text-error">{message}</p> : null}
      <Button type="submit" className="mt-3" variant="secondary" size="lg" busy={state === "busy"} busyLabel="Sending…" disabled={!email.trim()}>
        Email me a sign-in link
      </Button>
    </form>
  );
}
