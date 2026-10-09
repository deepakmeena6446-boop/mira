"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { outcomeMessage, type ContributionOutcome } from "@/components/app/CheckCard";
import { api } from "@/lib/api-client";
import { recordUsage } from "@/lib/usage-signal";
import { CORRECTIONS, CORRECTION_LABEL, type Correction } from "@/domain/contributions";

/** Which place a correction is about: its name and position, so two places never share one form or result. */
export const placeIdentity = (p: { name: string; lat: number; lon: number }) => `${p.name}|${p.lat.toFixed(5)},${p.lon.toFixed(5)}`;

type Props = { place: { name: string; lat: number; lon: number }; canCorrect: boolean; signedIn: boolean; country: string | null; className?: string };

/**
 * One secondary way to correct what Mira shows about a place she just looked at (sprint mira-companion-48h M6).
 * Optional: closing it never affects the brief. Uses the existing correction endpoint and its rules — one voice
 * per person, nothing changes on one person's word — and says the actual outcome, never "published".
 * Each place gets its own form (keyed by identity): another place, or a new look at this one, starts fresh.
 */
export function PlaceCorrection(props: Props) {
  return <CorrectionForm key={placeIdentity(props.place)} {...props} />;
}

function CorrectionForm({ place, canCorrect, signedIn, country, className }: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<Correction | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // An answer that arrives after she moved to another place belongs to that earlier form, which is gone.
  const current = useRef(true);
  useEffect(() => { current.current = true; return () => { current.current = false; }; }, []);

  const send = async (claim: Correction) => {
    setBusy(claim);
    setError(null);
    const r = await api<{ outcome: ContributionOutcome; placeName: string }>("/api/contribute/correction", { body: { name: place.name.slice(0, 120), lat: place.lat, lon: place.lon, claim, country } });
    if (!current.current) return;
    setBusy(null);
    if (r.ok) {
      recordUsage("correction");
      setResult(outcomeMessage(r.data.outcome));
      setOpen(false);
    } else setError(r.network ? "Not sent — you’re offline. Nothing was recorded; try again when you’re connected." : r.message);
  };

  return (
    <section aria-label="Correct this information" className={className}>
      {!open ? (
        <button type="button" aria-expanded={false} onClick={() => { setOpen(true); setResult(null); }} className="inline-flex min-h-11 items-center gap-1.5 px-1 text-sm font-semibold text-accent-strong">
          <Icon name="flag" className="size-4" />Correct this information
        </button>
      ) : (
        <div className="m-card p-4">
          <p className="font-semibold">What’s wrong about {place.name}?</p>
          {!canCorrect ? (
            <p className="mt-1 text-sm text-ink-muted">
              Corrections need a Google or email sign-in, so each person counts once. {signedIn ? <Link href="/me#account" className="font-semibold text-accent-strong">Add your email in You</Link> : <Link href="/me" className="font-semibold text-accent-strong">Sign in</Link>} — your brief stays as it is.
            </p>
          ) : (
            <ul className="mt-3 flex flex-col gap-2">
              {CORRECTIONS.map((c) => (
                <li key={c}>
                  <button type="button" disabled={busy !== null} onClick={() => void send(c)} className="flex min-h-12 w-full items-center rounded-2xl bg-sunken px-4 text-left text-sm font-semibold disabled:opacity-60">{busy === c ? "Sending…" : CORRECTION_LABEL[c]}</button>
                </li>
              ))}
            </ul>
          )}
          {error ? <p role="alert" className="mt-3 rounded-2xl bg-error-soft px-4 py-3 text-sm font-semibold text-error">{error}</p> : null}
          <button type="button" onClick={() => setOpen(false)} className="mt-2 min-h-11 text-sm font-semibold text-ink-muted">Not now</button>
          {canCorrect ? <p className="mt-1 text-xs text-ink-subtle">Mira changes nothing on one person’s word: a correction counts once someone else says the same.</p> : null}
        </div>
      )}
      {result ? <p role="status" className="mt-1 px-1 text-sm text-ink-muted">{result}</p> : null}
    </section>
  );
}
