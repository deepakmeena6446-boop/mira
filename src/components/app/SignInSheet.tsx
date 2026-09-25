"use client";

import { useState } from "react";
import { useOverlay } from "@/lib/use-overlay";
import { useRouter } from "next/navigation";
import { MiraOrb } from "./MiraOrb";
import { Button } from "@/components/ui/Button";
import { api } from "@/lib/api-client";

/**
 * Sign-in sheet. Placeholder mode: "Continue" creates a real local account from a
 * name (Google sign-in replaces this step later, same sheet).
 */
export function SignInSheet({ open, onClose, reason }: { open: boolean; onClose: () => void; reason?: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useOverlay(open, onClose);
  if (!open) return null;
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="signin-h" className="fixed inset-0 z-50 flex items-end justify-center bg-[rgb(10_6_24/0.45)] animate-fade sm:items-center" onClick={onClose}>
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={async (e) => {
          e.preventDefault();
          if (!name.trim() || busy) return;
          setBusy(true);
          setError(null);
          const res = await api("/api/auth/demo", { body: { name: name.trim() } });
          setBusy(false);
          if (res.ok) {
            onClose();
            router.refresh();
          } else setError(res.message);
        }}
        className="w-full max-w-md animate-rise rounded-t-[2rem] bg-surface p-7 pb-[max(1.75rem,env(safe-area-inset-bottom))] shadow-[var(--shadow-float)] sm:rounded-[2rem]"
      >
        <MiraOrb size={52} />
        <h2 id="signin-h" className="mt-4 text-2xl font-extrabold">
          {reason ?? "Let's get you set up"}
        </h2>
        <p className="mt-1 text-ink-muted">I&apos;ll remember your places and the people you trust, so sharing a trip takes one tap.</p>
        <label htmlFor="signin-name" className="mt-5 block text-sm font-bold">
          What should I call you?
        </label>
        <input
          autoFocus
          id="signin-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={40}
          autoComplete="given-name"
          placeholder="Your first name"
          className="mt-1.5 w-full min-h-13 rounded-2xl border border-line bg-sunken px-4 text-lg outline-none focus:border-accent focus:bg-surface"
        />
        {error ? <p className="mt-2 text-sm font-medium text-error">{error}</p> : null}
        <Button type="submit" variant="hero" size="lg" className="mt-5" busy={busy} busyLabel="Setting up…" disabled={!name.trim()}>
          Continue
        </Button>
        <p className="mt-3 text-center text-xs text-ink-subtle">Google sign-in is coming soon. For now, your name is all I need.</p>
      </form>
    </div>
  );
}
