"use client";

import { useState } from "react";
import Link from "next/link";
import { MiraOrb } from "@/components/app/MiraOrb";
import { Section } from "@/components/app/Section";
import { SearchOverlay, type Destination } from "@/components/app/SearchOverlay";
import { SignInSheet } from "@/components/app/SignInSheet";
import { CheckCard, outcomeMessage, type ContributionOutcome } from "@/components/app/CheckCard";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { api } from "@/lib/api-client";
import { useCountry } from "@/lib/locale-store";
import { useLocation } from "@/lib/location-store";
import { CORRECTIONS, CORRECTION_LABEL, type Correction } from "@/domain/contributions";
import type { CheckView } from "@/server/contributions/checks";
import type { ImpactView } from "@/server/contributions";

/** Same wording everywhere a report is offered: honest about review, never promises a person. */
const REPORT_PRIVACY_LINE = "Submitted privately. Reports may be reviewed before they can contribute to MIRA's information.";

export function ContributeScreen({ signedIn, durable, checks, impact, pendingChecks = false }: { signedIn: boolean; durable: boolean; checks: CheckView[]; impact: ImpactView | null; pendingChecks?: boolean }) {
  const [signIn, setSignIn] = useState(false);

  if (!signedIn) {
    return (
      <div className="bg-companion flex min-h-dvh flex-col items-center justify-center px-6 pb-32 text-center">
        <MiraOrb size={80} />
        <h1 className="mt-6 text-3xl font-extrabold">Help MIRA know your area better</h1>
        <p className="mt-2 max-w-sm text-ink-muted">
          After a walk, MIRA may ask one quick question about a place you passed, like whether it was open. You can also tell MIRA when something it shows is wrong. Anyone can help.
        </p>
        <Button className="mt-7 max-w-xs" variant="hero" size="lg" onClick={() => setSignIn(true)}>
          Sign in to help
        </Button>
        <Link href="/report" className="mt-4 min-h-11 text-sm font-bold text-accent">
          Report something privately
        </Link>
        <SignInSheet open={signIn} onClose={() => setSignIn(false)} reason="Sign in to help MIRA" />
      </div>
    );
  }

  return (
    <div className="bg-companion min-h-dvh px-4 pb-36 pt-[max(1.25rem,env(safe-area-inset-top))]">
      <div className="mx-auto flex max-w-xl flex-col gap-6">
        <header>
          <h1 className="text-3xl font-extrabold">Contribute</h1>
          <p className="mt-1 text-ink-muted">Help MIRA know your area better.</p>
        </header>

        <ChecksSection checks={checks} durable={durable} pendingChecks={pendingChecks} />
        <CorrectSection durable={durable} />

        <Section id="report" title="Report something">
          <div className="p-5">
            <p className="text-sm text-ink-muted">Something happened to you or near you? {REPORT_PRIVACY_LINE} Reports are never counted as contributions or rewarded.</p>
            <Link href="/report" className="mt-3 inline-flex min-h-12 items-center gap-2 rounded-full bg-accent px-5 font-bold text-accent-ink">
              <Icon name="flag" className="size-5" /> Report privately
            </Link>
          </div>
        </Section>

        {impact ? <ImpactSection impact={impact} /> : null}
      </div>
    </div>
  );
}

function ChecksSection({ checks, durable, pendingChecks }: { checks: CheckView[]; durable: boolean; pendingChecks: boolean }) {
  return (
    <section aria-labelledby="checks-h">
      <h2 id="checks-h" className="mb-2 px-1 text-sm font-bold uppercase tracking-wider text-ink-subtle">
        MIRA Checks
      </h2>
      {pendingChecks ? <p role="status" className="mb-3 rounded-[var(--radius-card)] bg-surface px-5 py-3 text-sm text-ink-muted shadow-[var(--shadow-card)]">A journey question is still being prepared. Check back here later.</p> : null}
      {checks.length ? (
        <div className="flex flex-col gap-3">
          {checks.map((c) => (
            <CheckCard key={c.id} check={c} />
          ))}
        </div>
      ) : (
        <p className="rounded-[var(--radius-card)] bg-surface px-5 py-4 text-sm text-ink-muted shadow-[var(--shadow-card)]">
          {durable
            ? "After your journeys, MIRA may ask one quick question about something you passed."
            : "After your journeys, MIRA may ask one quick question about something you passed. Sign in with Google or add your email in Me first: it keeps it to one voice per person."}
        </p>
      )}
    </section>
  );
}

function CorrectSection({ durable }: { durable: boolean }) {
  const loc = useLocation(false);
  const country = useCountry();
  const [searching, setSearching] = useState(false);
  const [place, setPlace] = useState<Destination | null>(null);
  const [busy, setBusy] = useState<Correction | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const send = async (claim: Correction) => {
    if (!place) return;
    setBusy(claim);
    setError(null);
    const r = await api<{ outcome: ContributionOutcome; placeName: string }>("/api/contribute/correction", {
      body: { name: place.name, lat: place.lat, lon: place.lon, claim, country: country.iso },
    });
    setBusy(null);
    if (r.ok) {
      setResult(`${r.data.placeName}: ${outcomeMessage(r.data.outcome)}`);
      setPlace(null);
    } else setError(r.network ? "Not sent. Check your connection and try again." : r.message);
  };

  return (
    <Section id="correct" title="Correct something">
      <div className="p-5">
        {!durable ? (
          <p className="text-sm text-ink-muted">
            Something MIRA shows about a place is wrong? <Link href="/me#account" className="font-bold text-accent">Sign in with Google or add your email in Me</Link> to correct it. It keeps corrections to one voice per person.
          </p>
        ) : place ? (
          <div>
            <p className="font-bold">What&apos;s wrong about {place.name}?</p>
            <ul className="mt-3 flex flex-col gap-2">
              {CORRECTIONS.map((c) => (
                <li key={c}>
                  <button type="button" disabled={busy !== null} onClick={() => send(c)} className="flex min-h-12 w-full items-center rounded-2xl bg-sunken px-4 text-left text-sm font-bold disabled:opacity-60">
                    {busy === c ? "Sending…" : CORRECTION_LABEL[c]}
                  </button>
                </li>
              ))}
            </ul>
            {error ? (
              <p role="alert" className="mt-3 rounded-2xl bg-error-soft px-4 py-3 text-sm font-semibold text-error">
                {error}
              </p>
            ) : null}
            <button type="button" onClick={() => setPlace(null)} className="mt-2 min-h-11 text-sm font-bold text-ink-muted">
              Cancel
            </button>
            <p className="mt-1 text-xs text-ink-subtle">MIRA changes nothing on one person&apos;s word: a correction counts once someone else says the same.</p>
          </div>
        ) : (
          <div>
            <p className="text-sm text-ink-muted">Something MIRA shows about a place is wrong? Find the place and choose what&apos;s wrong. No writing needed.</p>
            {result ? (
              <p role="status" className="mt-3 rounded-2xl bg-sunken px-4 py-3 text-sm">
                {result}
              </p>
            ) : null}
            <Button className="mt-3" variant="secondary" onClick={() => { setResult(null); setSearching(true); }}>
              <Icon name="pin" className="size-5 text-accent" /> Find a place
            </Button>
          </div>
        )}
        <SearchOverlay
          open={searching}
          onClose={() => setSearching(false)}
          onPick={(d) => {
            setPlace(d);
            setSearching(false);
          }}
          saved={[]}
          near={loc.point}
          placeholder="Which place?"
        />
      </div>
    </Section>
  );
}

function ImpactSection({ impact }: { impact: ImpactView }) {
  const s = impact.summary;
  return (
    <Section id="impact" title="Your impact">
      <div className="flex flex-col gap-3 p-5 text-sm">
        <p className="text-base font-bold">{impact.line ?? "Nothing verified yet."}</p>
        {!impact.line ? <p className="text-ink-muted">When someone else confirms what you told MIRA, it shows here.</p> : null}
        {s.archived ? <p className="text-ink-muted">{s.archived} earlier credited {s.archived === 1 ? "answer is" : "answers are"} kept for your record but cannot be rechecked, so {s.archived === 1 ? "it no longer counts" : "they no longer count"} toward current impact or Local Steward.</p> : null}
        {s.pending ? <p className="text-ink-muted">{s.pending} waiting for someone else to confirm.</p> : null}
        {s.differed ? <p className="text-ink-muted">{s.differed} where reports differed, so nobody was credited.</p> : null}
        <div className="rounded-2xl bg-sunken p-4">
          <p className="flex items-center gap-2 font-bold">
            <Icon name="shield" className="size-4 text-accent" /> Local Steward
          </p>
          {impact.steward.steward ? (
            <p className="mt-1 text-ink-muted">
              You&apos;re a Local Steward, so you can join beta local verification tasks. Your answers still need someone else to agree, like everyone&apos;s.
            </p>
          ) : (
            <>
              <p className="mt-1 text-ink-muted">For people whose answers others have confirmed over time and in different places. Still needed:</p>
              <ul className="mt-2 list-disc pl-5 text-ink-muted">
                {impact.steward.needs.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            </>
          )}
        </div>
        <p className="text-xs text-ink-subtle">No points, streaks or leaderboards. MIRA counts only what someone else confirmed, and a place you&apos;ve already confirmed counts once a month.</p>
      </div>
    </Section>
  );
}
