"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useOverlay } from "@/lib/use-overlay";
import { useRouter } from "next/navigation";
import { MiraOrb } from "./MiraOrb";
import { Button } from "@/components/ui/Button";
import { cx } from "@/components/ui/cx";
import { api } from "@/lib/api-client";
import { EmailSignIn } from "./EmailSignIn";
import { AdultAttestation, confirmAdultEligibility } from "./AdultAttestation";

export interface SignInOptions {
  google: boolean;
  email: boolean;
  demo: boolean;
}

/** What Mira keeps from Google, said once wherever she's offered it. */
export const GOOGLE_KEEPS = "Mira keeps your first name and a protected copy of your email — nothing else from Google.";

let optionsOnce: Promise<SignInOptions | null> | null = null;
function loadOptions(): Promise<SignInOptions | null> {
  optionsOnce ??= api<SignInOptions>("/api/auth/options").then((r) => {
    if (r.ok) return r.data;
    optionsOnce = null; // let the next open try again
    return null;
  });
  return optionsOnce;
}

/** Ways to sign in that this deployment offers (null while loading or unreachable). */
export function useSignInOptions(enabled = true): { options: SignInOptions | null; failed: boolean } {
  const [state, setState] = useState<{ options: SignInOptions | null; failed: boolean }>({ options: null, failed: false });
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    void loadOptions().then((o) => live && setState({ options: o, failed: !o }));
    return () => {
      live = false;
    };
  }, [enabled]);
  return state;
}

/** Google's "G" mark (brand colours), inline so there's no third-party request. */
function GoogleMark() {
  return (
    <svg aria-hidden viewBox="0 0 48 48" className="size-5 shrink-0">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

/**
 * "Continue with Google": a plain navigation to the start route (Google's own page does the rest),
 * then back to the screen she was on. Neutral white button, per Google's branding guidance.
 */
export function GoogleButton({ className, label = "Continue with Google" }: { className?: string; label?: string }) {
  const [busy, setBusy] = useState(false);
  const [adult, setAdult] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div>
      <AdultAttestation checked={adult} onChange={setAdult} />
      <button
      type="button"
      disabled={busy || !adult}
      aria-busy={busy || undefined}
      onClick={async () => {
        setBusy(true);
        setError(null);
        const eligibility = await confirmAdultEligibility();
        if (!eligibility.ok) { setError(eligibility.message); setBusy(false); return; }
        const here = window.location.pathname + window.location.search;
        // A real top-level navigation on purpose: a route handler that redirects off-site to Google.
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.assign(`/api/auth/google/start?next=${encodeURIComponent(here)}`);
      }}
      className={cx(
        "flex min-h-13 w-full items-center justify-center gap-3 rounded-full border border-[#747775] bg-white px-6 text-[1.05rem] font-semibold text-[#1f1f1f] transition-all hover:bg-[#f8f9fa] active:scale-[0.98] disabled:opacity-70",
        className,
      )}
    >
      {busy ? <span aria-hidden className="size-5 animate-spin rounded-full border-2 border-[#1f1f1f] border-t-transparent" /> : <GoogleMark />}
      <span>{label}</span>
      </button>
      {error ? <p role="alert" className="mt-2 text-sm text-error">{error}</p> : null}
    </div>
  );
}

/**
 * Sign-in sheet, opened only when she reaches something that needs an account (starting a
 * journey, her circle, saved places, contributions, Mira). Google first; then a one-time email
 * link for an account that already has her email; then first name only, where that's allowed.
 */
export function SignInSheet({ open, onClose, reason }: { open: boolean; onClose: () => void; reason?: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [adult, setAdult] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { options, failed } = useSignInOptions(open);
  useOverlay(open, onClose);
  if (!open) return null;
  const onlyName = options ? options.demo && !options.google : false;
  // Portal: screens are position:fixed (their own stacking context), and this must sit above the tab bar.
  return createPortal(
    <div role="dialog" aria-modal="true" aria-labelledby="signin-h" className="fixed inset-0 z-50 flex items-end justify-center bg-scrim animate-fade sm:items-center" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md animate-rise rounded-t-[var(--radius-lg)] bg-surface p-7 pb-[max(1.75rem,env(safe-area-inset-bottom))] shadow-[var(--shadow-float)] sm:rounded-[var(--radius-lg)]">
        <MiraOrb size={52} />
        <h2 id="signin-h" className="mt-4 text-2xl font-semibold">
          {reason ?? "Let's get you set up"}
        </h2>
        <p className="mt-1 text-ink-muted">I&apos;ll remember your places and the people you trust, so sharing a journey takes one tap.</p>

        {!options ? (
          failed ? (
            <p role="alert" className="mt-5 rounded-2xl bg-error-soft px-4 py-3 text-sm font-semibold text-error">
              We couldn&apos;t reach Mira. Check your connection and try again.
            </p>
          ) : (
            <div aria-busy="true" aria-label="Loading sign-in options" className="mt-5 h-13 w-full animate-pulse rounded-full bg-sunken" />
          )
        ) : null}

        {options?.google ? (
          <div className="mt-5">
            <GoogleButton />
            <p className="mt-2 text-center text-xs text-ink-subtle">{GOOGLE_KEEPS}</p>
          </div>
        ) : null}

        {options?.email ? (
          <div className="text-center">
            <EmailSignIn label={options.google ? "Use email instead" : "Already have an account? Sign in with email"} />
          </div>
        ) : null}

        {options?.demo ? (
          <form
            className={cx(!onlyName && "mt-4 border-t border-line pt-4")}
            onSubmit={async (e) => {
              e.preventDefault();
              if (!name.trim() || !adult || busy) return;
              setBusy(true);
              setError(null);
              const eligibility = await confirmAdultEligibility();
              if (!eligibility.ok) { setError(eligibility.message); setBusy(false); return; }
              const res = await api("/api/auth/demo", { body: { name: name.trim() } });
              setBusy(false);
              if (res.ok) {
                onClose();
                router.refresh();
              } else setError(res.message);
            }}
          >
            <label htmlFor="signin-name" className={cx("block text-sm font-bold", onlyName && "mt-5")}>
              {onlyName ? "What should I call you?" : "Or try Mira with just your first name"}
            </label>
            <input
              autoFocus={onlyName}
              id="signin-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={40}
              autoComplete="given-name"
              placeholder="Your first name"
              className="mt-1.5 w-full min-h-13 rounded-2xl border border-line bg-sunken px-4 text-lg outline-none focus:border-accent focus:bg-surface"
            />
            <AdultAttestation checked={adult} onChange={setAdult} />
            {error ? <p className="mt-2 text-sm font-medium text-error">{error}</p> : null}
            <Button type="submit" variant={onlyName ? "hero" : "secondary"} size="lg" className="mt-3" busy={busy} busyLabel="Setting up…" disabled={!name.trim() || !adult}>
              Continue
            </Button>
            <p className="mt-3 text-center text-xs text-ink-subtle">
              No password. This account lives in this browser only{options.google || options.email ? " — you can keep it later from Me." : "."}
            </p>
          </form>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
