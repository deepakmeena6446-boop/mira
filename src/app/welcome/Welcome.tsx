"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MiraOrb } from "@/components/app/MiraOrb";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { cx } from "@/components/ui/cx";
import { api } from "@/lib/api-client";
import { requestLocation } from "@/lib/location-store";

export const WELCOMED_KEY = "mira.welcomed";

function markWelcomed() {
  try {
    localStorage.setItem(WELCOMED_KEY, "1");
  } catch {
    /* storage unavailable: harmless */
  }
}

/** Three-step onboarding: meet Mira → location → name. */
export function Welcome({ signedIn }: { signedIn: boolean }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [locMsg, setLocMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const finish = () => {
    markWelcomed();
    router.replace("/");
    router.refresh();
  };

  const next = async () => {
    if (step === 0) return setStep(1);
    if (step === 1) {
      setBusy(true);
      const s = await requestLocation();
      setBusy(false);
      if (s.status === "ok" || s.status === "denied" || s.status === "unavailable") {
        if (s.status !== "ok") setLocMsg("No problem — you can turn it on later. You can always search for places instead.");
        return signedIn ? finish() : setStep(2);
      }
      return;
    }
    if (!name.trim()) return;
    setBusy(true);
    const r = await api("/api/auth/demo", { body: { name: name.trim() } });
    setBusy(false);
    if (r.ok) finish();
    else setError(r.message);
  };

  const steps = [
    <div key="mira" className="flex flex-col items-center text-center">
      <MiraOrb size={120} />
      <h1 className="mt-8 text-4xl font-extrabold tracking-tight">Hi, I&apos;m Mira</h1>
      <p className="mt-3 max-w-xs text-lg text-ink-muted">Your walking companion. I help you get where you&apos;re going — and let the people you trust walk with you, live.</p>
      <ul className="mt-8 w-full max-w-xs space-y-3 text-left">
        {[
          ["🗺️", "See what's around you and along your walk"],
          ["💜", "Share your trip live in one tap"],
          ["🤝", "Look out for each other, anonymously"],
        ].map(([e, t]) => (
          <li key={t} className="flex items-center gap-3 rounded-2xl bg-surface/80 px-4 py-3 font-semibold shadow-[var(--shadow-card)]">
            <span className="text-2xl">{e}</span> {t}
          </li>
        ))}
      </ul>
    </div>,
    <div key="loc" className="flex flex-col items-center text-center">
      <div className="grid size-28 place-items-center rounded-full bg-accent-soft text-accent">
        <Icon name="locate" className="size-14" />
      </div>
      <h1 className="mt-8 text-3xl font-extrabold">Where are you?</h1>
      <p className="mt-3 max-w-xs text-lg text-ink-muted">I use your location to show what&apos;s around and to share trips — only the ones you choose. I never keep a history of where you&apos;ve been.</p>
      {locMsg ? <p className="mt-4 rounded-2xl bg-surface px-4 py-2 text-sm font-semibold text-ink-muted">{locMsg}</p> : null}
    </div>,
    <div key="name" className="flex w-full flex-col items-center text-center">
      <MiraOrb size={84} />
      <h1 className="mt-7 text-3xl font-extrabold">What should I call you?</h1>
      <p className="mt-2 max-w-xs text-ink-muted">So I can remember your places and the people you trust.</p>
      <label htmlFor="w-name" className="sr-only">
        Your first name
      </label>
      <input
        id="w-name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={40}
        autoComplete="given-name"
        enterKeyHint="go"
        onKeyDown={(e) => {
          if (e.key === "Enter") void next();
        }}
        placeholder="Your first name"
        className="mt-6 w-full max-w-xs min-h-14 rounded-2xl border border-line bg-surface px-5 text-center text-xl font-semibold outline-none focus:border-accent"
      />
      {error ? <p className="mt-2 text-sm font-semibold text-error">{error}</p> : null}
      <p className="mt-3 text-xs text-ink-subtle">Google sign-in is coming soon.</p>
    </div>,
  ];


  const total = signedIn ? 2 : 3;
  return (
    <main id="main" className="bg-companion flex min-h-dvh flex-col px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1.5rem,env(safe-area-inset-top))]">
      <div className="flex items-center justify-between">
        <div className="flex gap-1.5" aria-label={`Step ${step + 1} of ${total}`}>
          {Array.from({ length: total }, (_, i) => (
            <span key={i} className={cx("h-1.5 rounded-full transition-all", i === step ? "w-8 bg-accent" : "w-3 bg-line-strong")} />
          ))}
        </div>
        <button type="button" onClick={finish} className="min-h-11 rounded-full px-3 text-sm font-bold text-ink-muted">
          Skip
        </button>
      </div>
      <div className="flex flex-1 items-center justify-center py-8">
        <div key={step} className="w-full max-w-sm animate-rise">
          {steps[step]}
        </div>
      </div>
      <Button variant="hero" size="lg" onClick={next} busy={busy} busyLabel={step === 1 ? "Asking…" : "Setting up…"} disabled={step === 2 && !name.trim()} className="mx-auto max-w-sm">
        {step === 0 ? "Let's go" : step === 1 ? "Use my location" : "Start using MIRA"}
      </Button>
    </main>
  );
}
