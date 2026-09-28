"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MiraOrb } from "@/components/app/MiraOrb";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { cx } from "@/components/ui/cx";
import { requestLocation } from "@/lib/location-store";
import { SignInSheet } from "@/components/app/SignInSheet";

export const WELCOMED_KEY = "mira.welcomed";

function markWelcomed() {
  try {
    localStorage.setItem(WELCOMED_KEY, "1");
  } catch {
    /* storage unavailable: harmless */
  }
}

/**
 * Two steps, no account: the promise → location, then Home, signed out. She can search a place and
 * see what's known about the way first; Mira asks her to sign in only when she reaches something
 * that needs an account (starting a journey, her circle, saved places, contributing, Mira).
 */
export function Welcome({ signedIn }: { signedIn: boolean }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [signIn, setSignIn] = useState(false);

  const finish = () => {
    markWelcomed();
    router.replace("/");
    router.refresh();
  };

  const next = async () => {
    if (step === 0) return setStep(1);
    setBusy(true);
    const s = await requestLocation();
    setBusy(false);
    // Allowed, refused or unavailable: Home explains the state, and search works either way.
    if (s.status === "ok" || s.status === "denied" || s.status === "unavailable") finish();
  };

  const steps = [
    <div key="promise" className="flex flex-col items-center text-center">
      <MiraOrb size={72} />
      <h1 className="mt-7 text-4xl font-semibold tracking-tight">With you until you arrive.</h1>
      <p className="mt-3 max-w-xs text-lg text-ink-muted">Mira helps you understand the way, lets your people follow until you arrive, and puts help one tap away if something feels wrong.</p>
      <p className="mt-2 max-w-xs text-sm text-ink-subtle">Designed around the realities women face moving through cities. Useful to anyone.</p>
      <ul className="mt-7 w-full max-w-xs space-y-3 text-left">
        {[
          ["🧭", "Before you go", "Lighting evidence and Help Points along the way, recent relevant updates — and what isn't known, said plainly"],
          ["📍", "On the way", "The people you choose follow a live link until you arrive, then it switches off. They don't need an account"],
          ["📞", "If something feels wrong", "The nearest Help Point, your people, your location in words, and the local emergency number where it's been reviewed"],
        ].map(([e, t, d]) => (
          <li key={t} className="flex items-start gap-3 rounded-2xl bg-surface/80 px-4 py-3 shadow-[var(--shadow-card)]">
            <span aria-hidden className="text-2xl">
              {e}
            </span>
            <span>
              <span className="block font-semibold">{t}</span>
              <span className="block text-sm text-ink-muted">{d}</span>
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-5 max-w-xs text-sm text-ink-muted">
        <strong className="text-ink">Mira</strong>, your companion, can do any of this with you — and all of it works without her. Your live location is shared only during a journey you start, and Mira keeps no history of where you&apos;ve been.
      </p>
    </div>,
    <div key="loc" className="flex flex-col items-center text-center">
      <div className="grid size-28 place-items-center rounded-full bg-accent-soft text-accent">
        <Icon name="locate" className="size-14" />
      </div>
      <h1 className="mt-8 text-3xl font-semibold">Where are you?</h1>
      <p className="mt-3 max-w-xs text-lg text-ink-muted">Mira uses your location to show the way from here, the Help Points near you, and to share the journeys you choose. It never keeps a history of where you&apos;ve been.</p>
      <p className="mt-3 max-w-xs text-sm text-ink-subtle">No account needed to look around. You can always search for places instead.</p>
    </div>,
  ];

  const total = steps.length;
  return (
    <main id="main" className="bg-companion flex min-h-dvh flex-col px-6 pt-[max(1.5rem,env(safe-area-inset-top))]">
      <div className="flex items-center justify-between">
        <div className="flex gap-1.5" aria-label={`Step ${step + 1} of ${total}`}>
          {Array.from({ length: total }, (_, i) => (
            <span key={i} className={cx("h-1.5 rounded-full transition-all", i === step ? "w-8 bg-accent" : "w-3 bg-line-strong")} />
          ))}
        </div>
        <button type="button" onClick={finish} className="min-h-11 rounded-full px-3 text-sm font-semibold text-ink-muted">
          Skip
        </button>
      </div>
      <div className="flex flex-1 items-center justify-center py-6">
        <div key={step} className="w-full max-w-sm animate-rise">
          {steps[step]}
        </div>
      </div>
      {/* Always on screen: on a small phone the story scrolls under the action instead of pushing it off. */}
      <div className="sticky bottom-0 -mx-6 flex flex-col bg-gradient-to-t from-canvas via-canvas to-transparent px-6 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-6">
        <Button variant="hero" size="lg" onClick={next} busy={busy} busyLabel="Asking…" className="mx-auto max-w-sm">
          {step === 0 ? "Continue" : "Use my location"}
        </Button>
        {step === 0 && !signedIn ? (
          <button type="button" onClick={() => setSignIn(true)} className="mx-auto mt-1 min-h-11 px-3 text-sm font-semibold text-ink-muted">
            Already use Mira? Sign in
          </button>
        ) : null}
      </div>
      <SignInSheet open={signIn} reason="Welcome back" onClose={() => setSignIn(false)} />
    </main>
  );
}
