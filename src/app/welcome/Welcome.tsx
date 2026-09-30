"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MiraPulse } from "@/components/app/MiraPulse";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { cx } from "@/components/ui/cx";
import { rememberLocationChoice, requestLocation } from "@/lib/location-store";
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
 * Two short steps, no account required: shared purpose, then optional location.
 */
export function Welcome({ signedIn }: { signedIn: boolean }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [signIn, setSignIn] = useState(false);

  const finish = (skipLocation = true) => {
    rememberLocationChoice(!skipLocation);
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
    if (s.status === "ok" || s.status === "denied" || s.status === "unavailable") finish(s.status !== "ok");
  };

  const steps = [
    <div key="promise" className="flex flex-col">
      <MiraPulse size={28} />
      <h1 className="mt-6 text-[2.25rem] font-semibold leading-[1.08] tracking-tight">Know more. Move freely. Together.</h1>
      <p className="mt-3 text-lg text-ink-muted">Mira helps you know a place, move with support, and help the next person.</p>
      <div className="mt-7 flex gap-3 rounded-[var(--radius-lg)] bg-warm-soft p-4"><Icon name="community" className="mt-0.5 shrink-0 text-warm" /><p className="text-sm font-medium">People share small details. Mira checks what holds up. Your local picture gets better over time.</p></div>
      <p className="mt-5 text-sm text-ink-subtle">Built around women&apos;s everyday safety. Everyone can help. Your movement history stays yours.</p>
    </div>,
    <div key="loc" className="flex flex-col items-center text-center">
      <div className="grid size-20 place-items-center rounded-full bg-accent-soft text-accent">
        <Icon name="locate" className="size-10" />
      </div>
      <h1 className="mt-7 text-[1.75rem] font-semibold">See what&apos;s around you?</h1>
      <p className="mt-3 max-w-xs text-lg text-ink-muted">Your location brings local context and help closer. Mira doesn&apos;t keep a movement history.</p>
      <p className="mt-3 max-w-xs text-sm text-ink-subtle">Your choice. Search places without location too.</p>
    </div>,
  ];

  const total = steps.length;
  return (
    <main id="main" className="bg-companion flex min-h-dvh flex-col px-6 pt-[max(1.5rem,env(safe-area-inset-top))]">
      <div className="flex items-center justify-between">
        <div className="flex gap-1.5" aria-label={`Step ${step + 1} of ${total}`}>
          {Array.from({ length: total }, (_, i) => (
            <span key={i} className={cx("h-1.5 rounded-full transition-all", i === step ? "w-7 bg-accent" : "w-3 bg-line-strong")} />
          ))}
        </div>
        <button type="button" onClick={() => finish()} className="min-h-11 rounded-full px-3 text-sm font-semibold text-ink-muted">
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
        <Button variant="primary" size="lg" onClick={next} busy={busy} busyLabel="Asking…" className="mx-auto max-w-sm">
          {step === 0 ? "Continue" : "Use my location"}
        </Button>
        {step === 1 ? <button type="button" onClick={() => finish()} className="mx-auto mt-1 min-h-11 px-3 text-sm font-semibold text-accent-strong">Search places instead</button> : null}
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
