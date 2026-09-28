"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { MiraPulse } from "@/components/app/MiraPulse";
import { SEEN_SCOUT_KEY, readNumber, recordUsage, writeValue } from "@/lib/usage-signal";
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
const REPORT_PRIVACY_LINE = "Submitted privately. Reports may be reviewed before they can contribute to Mira's information.";

/** The street tiles first (everyday observations anyone can make), then what happened. Two taps to a report. */
const QUICK: Array<{ c: string; icon: string; label: string; hint: string }> = [
  { c: "environment", icon: "lamp", label: "Dark or broken street", hint: "Lighting, footpaths, blocked or flooded streets" },
  { c: "transport_issue", icon: "bus", label: "Transport problem", hint: "Waits, crowding, stops not served" },
  { c: "positive_condition", icon: "sun", label: "Something good", hint: "Good lighting, people around, help" },
];

export function ContributeScreen({ signedIn, durable, checks, impact, pendingChecks = false }: { signedIn: boolean; durable: boolean; checks: CheckView[]; impact: ImpactView | null; pendingChecks?: boolean }) {
  const [signIn, setSignIn] = useState(false);
  // A ready question moves above Report for this visit only (Report stays in the first screen either way).
  const checksFirst = signedIn && checks.length > 0;
  const report = <ReportSection key="report" />;
  const checksBlock = signedIn ? <ChecksSection key="checks" checks={checks} pendingChecks={pendingChecks} /> : null;
  return (
    <div className="bg-companion min-h-dvh px-4 pb-[calc(var(--tabbar-space)+2rem)] pt-[max(1.25rem,env(safe-area-inset-top))]">
      <div className="mx-auto flex max-w-xl flex-col gap-7">
        <header>
          <h1 className="text-[1.75rem] font-semibold tracking-tight">Contribute</h1>
          <p className="mt-1 text-ink-muted">Help Mira understand your streets. What you send is private.</p>
        </header>

        {impact?.steward.steward ? <ScoutWelcome /> : null}
        {checksFirst ? [checksBlock, report] : [report, checksBlock]}

        {!signedIn ? (
          <section className="rounded-[var(--radius-card)] border border-line bg-surface p-5">
            <p className="text-sm text-ink-muted">Sign in to answer Mira Checks after your journeys, correct places Mira shows, and see what you&apos;ve helped confirm.</p>
            <Button className="mt-3" variant="secondary" onClick={() => setSignIn(true)}>
              Sign in
            </Button>
            <SignInSheet open={signIn} onClose={() => setSignIn(false)} reason="Sign in to help Mira" />
          </section>
        ) : !durable ? (
          <p className="rounded-[var(--radius-card)] border border-line bg-surface px-5 py-4 text-sm text-ink-muted">
            Checks and corrections need a Google or email sign-in, so each person counts once.{" "}
            <Link href="/me#account" className="font-semibold text-accent-strong">
              Keep your account
            </Link>
          </p>
        ) : (
          <CorrectSection durable={durable} />
        )}

        {impact ? <ImpactSection impact={impact} /> : null}
      </div>
    </div>
  );
}

/** Street observations in two taps: a tile opens the report form with the category chosen. */
function ReportSection() {
  return (
    <section id="report" aria-labelledby="report-h" className="scroll-mt-6">
      <h2 id="report-h" className="mb-2 px-1 text-[13px] font-medium text-ink-subtle">
        Report something
      </h2>
      <div className="grid gap-2">
        {QUICK.map((t) => (
          <Link key={t.c} href={`/report?c=${t.c}&from=contribute`} className="flex min-h-16 items-center gap-3 rounded-[var(--radius-card)] border border-line bg-surface px-4 py-3 hover:bg-sunken">
            <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-[var(--radius-control)] bg-sunken text-ink">
              <Icon name={t.icon} className="size-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold leading-tight">{t.label}</span>
              <span className="block text-sm text-ink-muted">{t.hint}</span>
            </span>
            <Icon name="chevron" className="size-4 text-ink-subtle" />
          </Link>
        ))}
        <Link href="/report?from=contribute" className="flex min-h-12 items-center justify-between rounded-[var(--radius-card)] border border-line bg-surface px-4 text-sm font-semibold hover:bg-sunken">
          Something that happened to you or near you
          <Icon name="chevron" className="size-4 text-ink-subtle" />
        </Link>
      </div>
      <p className="mt-2 px-1 text-xs text-ink-subtle">{REPORT_PRIVACY_LINE} Reports are never counted as contributions or rewarded.</p>
    </section>
  );
}

/** Once, the first time this phone sees her as a Mira Scout (docs/launch-ux/07 §C.5). */
function ScoutWelcome() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- device storage exists only after mount
    if (readNumber(SEEN_SCOUT_KEY) !== 1) setShow(true);
    writeValue(SEEN_SCOUT_KEY, "1");
  }, []);
  if (!show) return null;
  return (
    <section className="flex items-start gap-3 rounded-[var(--radius-card)] border border-accent/30 bg-accent-soft p-4 animate-rise" aria-label="Mira Scout">
      <MiraPulse size={16} scout state="observing" className="mt-0.5" />
      <div className="min-w-0 flex-1">
        <p className="font-semibold">You&apos;re a Mira Scout.</p>
        <p className="text-sm text-ink-muted">Others keep confirming what you tell Mira, in different places and on different days.</p>
      </div>
      <button type="button" aria-label="Close" onClick={() => setShow(false)} className="grid size-11 shrink-0 place-items-center rounded-full">
        <Icon name="close" className="size-4" />
      </button>
    </section>
  );
}

function ChecksSection({ checks, pendingChecks }: { checks: CheckView[]; pendingChecks: boolean }) {
  return (
    <section id="checks" aria-labelledby="checks-h" className="scroll-mt-6">
      <h2 id="checks-h" className="mb-2 px-1 text-[13px] font-medium text-ink-subtle">
        Mira Checks
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
          After a journey, Mira may ask one quick question about something you passed.
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
      recordUsage("correction");
      setResult(`${r.data.placeName}: ${outcomeMessage(r.data.outcome)}`);
      setPlace(null);
    } else setError(r.network ? "Not sent. Check your connection and try again." : r.message);
  };

  return (
    <Section id="correct" title="Correct a place">
      <div className="p-5">
        {!durable ? (
          <p className="text-sm text-ink-muted">
            Something Mira shows about a place is wrong? <Link href="/me#account" className="font-semibold text-accent-strong">Sign in with Google or add your email in Me</Link> to correct it. It keeps corrections to one voice per person.
          </p>
        ) : place ? (
          <div>
            <p className="font-semibold">What&apos;s wrong about {place.name}?</p>
            <ul className="mt-3 flex flex-col gap-2">
              {CORRECTIONS.map((c) => (
                <li key={c}>
                  <button type="button" disabled={busy !== null} onClick={() => send(c)} className="flex min-h-12 w-full items-center rounded-2xl bg-sunken px-4 text-left text-sm font-semibold disabled:opacity-60">
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
            <button type="button" onClick={() => setPlace(null)} className="mt-2 min-h-11 text-sm font-semibold text-ink-muted">
              Cancel
            </button>
            <p className="mt-1 text-xs text-ink-subtle">Mira changes nothing on one person&apos;s word: a correction counts once someone else says the same.</p>
          </div>
        ) : (
          <div>
            <p className="text-sm text-ink-muted">Something Mira shows about a place is wrong? Find the place and choose what&apos;s wrong. No writing needed.</p>
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
        <p className="text-base font-semibold">{impact.line ?? "Nothing confirmed yet."}</p>
        {!impact.line ? <p className="text-ink-muted">When someone else confirms what you told Mira, it shows here.</p> : null}
        {s.archived ? <p className="text-ink-muted">{s.archived} earlier credited {s.archived === 1 ? "answer is" : "answers are"} kept for your record but cannot be rechecked, so {s.archived === 1 ? "it no longer counts" : "they no longer count"} toward current impact or Mira Scout.</p> : null}
        {s.pending ? <p className="text-ink-muted">{s.pending} waiting for someone else to confirm.</p> : null}
        {s.differed ? <p className="text-ink-muted">{s.differed} where reports differed, so nobody was credited.</p> : null}
        <div className="rounded-[var(--radius-card)] bg-sunken p-4">
          <p className="flex items-center gap-2 font-semibold">
            <MiraPulse size={14} scout={impact.steward.steward} /> Mira Scout
          </p>
          {impact.steward.steward ? (
            <p className="mt-1 text-ink-muted">
              Others keep confirming what you tell Mira, in different places and on different days. You can join beta local verification tasks. Your answers still need someone else to agree, like everyone&apos;s.
            </p>
          ) : (
            // A status that comes with time, not a target: the list is there if she asks, never a checklist to chase.
            <details className="mt-1 text-ink-muted">
              <summary className="min-h-8 cursor-pointer">For people whose answers others have confirmed over time and in different places. <span className="font-semibold text-accent-strong">What it takes</span></summary>
              <ul className="mt-2 list-disc pl-5">
                {impact.steward.needs.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
        <p className="text-xs text-ink-subtle">No points, streaks or leaderboards. Mira counts only what someone else confirmed, and a place you&apos;ve already confirmed counts once a month.</p>
      </div>
    </Section>
  );
}
