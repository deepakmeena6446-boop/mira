"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
import { SafetyAccess } from "@/components/app/SafetyAccess";
import { StateNote } from "@/components/mira/Frame";
import { Row, RowList } from "@/components/mira/Rows";

/** Same wording everywhere a report is offered: honest about review, never promises a person. */
const REPORT_PRIVACY_LINE = "Sent privately. Some reports are reviewed before informing Mira.";

/** The street tiles first (everyday observations anyone can make), then what happened. Two taps to a report. */
const QUICK: Array<{ c: string; icon: string; label: string; hint: string }> = [
  { c: "environment", icon: "lamp", label: "Dark or broken street", hint: "Lighting, footpaths, blocked or flooded streets" },
  { c: "transport_issue", icon: "bus", label: "Transport problem", hint: "Waits, crowding, stops not served" },
  { c: "positive_condition", icon: "sun", label: "Something good", hint: "Good lighting, people around, help" },
];

export function ContributeScreen({ signedIn, durable, checks, impact, pendingChecks = false, emailAlerts }: { signedIn: boolean; durable: boolean; checks: CheckView[]; impact: ImpactView | null; pendingChecks?: boolean; emailAlerts: boolean }) {
  const router = useRouter();
  const [signIn, setSignIn] = useState(false);
  const report = <ReportSection key="report" />;
  const checksBlock = signedIn ? <ChecksSection key="checks" checks={checks} pendingChecks={pendingChecks} /> : null;
  return (
    <div className="m-screen bg-companion">
      <div className="m-screen-inner flex flex-col gap-7">
        <header>
          <div className="flex items-center justify-between gap-3">
            <button type="button" onClick={() => (window.history.length > 1 ? router.back() : router.push("/"))} aria-label="Back" className="grid size-11 shrink-0 place-items-center rounded-full bg-surface ring-1 ring-line"><Icon name="back" className="size-5" /></button>
            <SafetyAccess emailAlerts={emailAlerts} compact quiet className="min-w-0" />
          </div>
          <h1 className="m-display mt-5">Add what you know</h1>
          <p className="mt-1 text-[0.95rem] text-ink-muted">A small detail helps the next person. Only what several people agree on ever shows as a note.</p>
        </header>

        {impact?.steward.steward ? <ScoutWelcome /> : null}
        {/* What you can do first; your impact once there is any (never a wall of zeros). */}
        {checksBlock}
        {report}
        {impact && (impact.summary.verified || impact.summary.pending || impact.summary.differed) ? <ImpactSection impact={impact} /> : null}

        {!signedIn ? (
          <>
            <StateNote title="Answer Mira Checks and correct places" action={<button type="button" onClick={() => setSignIn(true)} className="mira-primary min-h-11 px-5 text-sm">Sign in</button>}>Sign in to answer Mira Checks after your journeys, correct places Mira shows, and see what you&apos;ve helped confirm.</StateNote>
            <SignInSheet open={signIn} onClose={() => setSignIn(false)} reason="Sign in to help Mira" />
          </>
        ) : !durable ? (
          <StateNote title="Checks and corrections count each person once" action={<Link href="/me#account" className="font-semibold text-accent-strong">Keep your account</Link>}>They need a Google or email sign-in.</StateNote>
        ) : (
          <CorrectSection durable={durable} />
        )}

      </div>
    </div>
  );
}

/** Street observations in two taps: a tile opens the report form with the category chosen. */
function ReportSection() {
  return (
    <section id="report" className="scroll-mt-6">
      <RowList label="Report something" id="report-h">
        {QUICK.map((t) => <Row key={t.c} icon={t.icon} tone="dusk" title={t.label} detail={t.hint} href={`/report?c=${t.c}&from=contribute`} />)}
        <Row icon="flag" tone="ink" title="Something that happened" detail="To you or near you — privately" href="/report?from=contribute" />
      </RowList>
      <p className="m-meta mt-2 px-1">{REPORT_PRIVACY_LINE} Reports never earn credit.</p>
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
    <section className="flex items-start gap-3 rounded-2xl bg-people-soft p-4 animate-rise" aria-label="Mira Scout">
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
      <h2 id="checks-h" className="m-label">Mira Checks</h2>
      {pendingChecks ? <StateNote className="mt-2.5">A journey question is still being prepared. Check back here later.</StateNote> : null}
      {checks.length ? (
        <div className="mt-2.5 flex flex-col gap-2.5">
          {checks.map((c) => (
            <CheckCard key={c.id} check={c} />
          ))}
        </div>
      ) : (
        <StateNote className="mt-2.5">After a journey, Mira may ask one quick question about something you passed.</StateNote>
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
            Something Mira shows about a place is wrong? <Link href="/me#account" className="font-semibold text-accent-strong">Sign in with Google or add your email in You</Link> to correct it. It keeps corrections to one voice per person.
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
  const bars = [
    { label: "Lighting", value: s.byKind.lighting },
    { label: "Places", value: s.byKind.place_status },
    { label: "Corrections", value: s.byKind.correction },
  ];
  const max = Math.max(1, ...bars.map((b) => b.value));
  return (
    <Section id="impact" title="Your impact">
      <div className="flex flex-col gap-3 p-5 text-sm">
        <div className="flex items-start justify-between gap-3">
          <p><strong className="block text-[2rem] leading-none tabular-nums">{s.verified}</strong><span className="mt-1 block text-ink-muted">local details confirmed</span></p>
          <span className="rounded-full bg-sunken px-2.5 py-1 text-xs font-semibold text-ink-muted">Only you see this</span>
        </div>
        <div className="grid grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-2" role="img" aria-label={`Verified contributions: ${bars.map((b) => `${b.label} ${b.value}`).join(", ")}`}>
          {bars.map((b) => <div key={b.label} className="contents"><span className="text-ink-muted">{b.label}</span><span className="h-2.5 overflow-hidden rounded-full bg-sunken"><span className="block h-full rounded-full bg-accent" style={{ width: `${b.value ? Math.max(8, b.value / max * 100) : 0}%` }} /></span><strong className="tabular-nums">{b.value}</strong></div>)}
        </div>
        {!s.verified ? <p className="text-ink-muted">When someone else confirms a detail, it appears here.</p> : null}
        {s.archived ? <p className="text-ink-muted">{s.archived} earlier credited {s.archived === 1 ? "answer is" : "answers are"} kept for your record but cannot be rechecked, so {s.archived === 1 ? "it no longer counts" : "they no longer count"} toward current impact or Mira Scout.</p> : null}
        {s.pending ? <p className="text-ink-muted">{s.pending} waiting for someone else to confirm.</p> : null}
        {s.differed ? <p className="text-ink-muted">{s.differed} where reports differed, so nobody was credited.</p> : null}
        <div className="rounded-2xl bg-sunken p-4">
          <p className="flex items-center gap-2 font-semibold">
            <MiraPulse size={14} scout={impact.steward.steward} /> Mira Scout
          </p>
          {impact.steward.steward ? (
            <p className="mt-1 text-ink-muted">
              Your checks keep holding up across places and days. Scout answers still need independent agreement.
            </p>
          ) : (
            <details className="mt-1 text-ink-muted">
              <summary className="min-h-8 cursor-pointer">Consistent, independently confirmed checks. <span className="font-semibold text-accent-strong">How it works</span></summary>
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
