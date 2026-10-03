"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { HelpCluster } from "@/components/app/HelpCluster";
import { SkyCard, skyAt } from "@/components/mira/LiveNow";
import { UnsafeSheet } from "@/components/app/UnsafeSheet";
import { RoutePreview } from "@/components/app/RoutePreview";
import { SavedReturnReview } from "@/components/app/SavedReturnReview";
import { endLocalCheckIn, readLocalCheckIn, readLocalJourney, useLocalJourney, recordLocalJourneyCheckIn, markLocalProgress, localJourneyChoice, restoreLocalJourney } from "@/lib/local-check-in-store";
import { setPlanDraft, usePlanDraft } from "@/lib/plan-store";
import { activatePlanLeg, intentFromDraft } from "@/domain/plan-state";
import type { LocalCheckIn } from "@/domain/local-check-in";
import type { PlanOptionsResult } from "@/domain/plan-options";
import { api } from "@/lib/api-client";
import { closeOverlayThen } from "@/lib/use-overlay";

export function LocalCheckInScreen() {
  const router = useRouter(); const draft = usePlanDraft();
  const [entry, setEntry] = useState<LocalCheckIn | null>(null);
  const journey = useLocalJourney();
  const [hydrated, setHydrated] = useState(false);
  const [now, setNow] = useState<number | null>(null);
  const [unsafe, setUnsafe] = useState(false);
  const [closed, setClosed] = useState<"arrived" | "ended" | null>(null);
  const [restoreMessage, setRestoreMessage] = useState<string | null>(null);
  useEffect(() => { const refresh = () => { setNow(Date.now()); setEntry(readLocalCheckIn());  setHydrated(true); }; refresh(); const timer = window.setInterval(refresh, 15_000); document.addEventListener("visibilitychange", refresh); return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", refresh); }; }, []);
  useEffect(() => {
    if (!draft || readLocalJourney() || closed) return;
    const plan = intentFromDraft(draft); if (!plan) return;
    const choice = localJourneyChoice(plan); if (!choice) return;
    let live = true;
    if (!choice.optionId) { restoreLocalJourney(plan, null, choice.progress, choice.checkedInAt);  return; }
    void api<PlanOptionsResult>("/api/plan/options", { body: { intent: plan } }).then((r) => { if (!live) return; const option = r.ok && r.data.state === "ready" ? r.data.options.find((o) => o.id === choice.optionId) : null; if (option) { restoreLocalJourney(plan, option, choice.progress, choice.checkedInAt);  } else setRestoreMessage("The selected route could not be refreshed. Keep the manual check-in; review your plan before relying on guidance."); });
    return () => { live = false; };
  }, [draft, closed]);
  const remaining = entry && now !== null ? Math.max(0, Math.ceil((entry.dueAt - now) / 60_000)) : null;
  const finish = (state: "arrived" | "ended") => { endLocalCheckIn(); setEntry(null); setClosed(state); };
  const returnIndex = draft?.legs?.findIndex((leg) => /^Return to /i.test(leg.label)) ?? -1;
  const returnPlan = draft && returnIndex >= 0 ? activatePlanLeg(draft, returnIndex) : null;
  const reviewedPlan = draft ? intentFromDraft(draft) : null;
  const updatedAt = journey?.updatedAt ?? (reviewedPlan ? localJourneyChoice(reviewedPlan)?.updatedAt : null);
  return <div className="m-screen bg-companion"><div className="m-screen-inner flex flex-col gap-5">
    <header className="flex items-center justify-between gap-3"><Link href="/" className="mira-wordmark">mira<span aria-hidden>↗</span></Link><HelpCluster compact onUnsafe={() => setUnsafe(true)} /></header>
    <div><p className="m-label">Private · manual journey</p><h1 className="m-display mt-1">{closed === "arrived" ? "You’ve arrived." : closed === "ended" ? "Journey ended." : journey?.plan.loop ? "Your way around." : journey?.plan.destination?.query ?? "Your manual journey."}</h1><p className="m-meta mt-2">Route review and your own check-in. No GPS, monitoring, contact alerts or automatic arrival.</p></div>
    {!hydrated ? <p role="status">Opening your journey…</p> : !entry ? <><section className="m-card p-5" role="status"><p className="text-ink-muted">{closed === "arrived" ? "Arrival was confirmed by you. Nothing was sent to contacts." : closed === "ended" ? "You ended early; this is not recorded as arrival." : "No private check-in is active in this tab."}</p>{returnPlan ? <button type="button" className="mira-primary mt-4 w-full" onClick={() => { setPlanDraft(returnPlan); router.push("/plan?planStep=options"); }}>Review return journey</button> : <Link href="/plan" className="mira-primary mt-4 w-full">Return to plan</Link>}</section>{!returnPlan ? <SavedReturnReview /> : null}</> : <>
      {journey?.option ? <RoutePreview option={journey.option} /> : null}
      {restoreMessage ? <p role="status" className="text-sm text-warm">{restoreMessage}</p> : null}
      <div className="m-card p-4"><Link href="/plan/legs" className="inline-flex min-h-12 items-center font-semibold text-accent-strong">Review or change this journey</Link><p className="text-sm text-ink-muted">Review the plan and manually confirm the origin for your continued journey. A separate confirmation updates this same private journey; Mira does not replace your origin with GPS.</p>{updatedAt ? <p role="status" className="mt-2 text-sm text-ink-muted">Journey update confirmed at {new Date(updatedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", timeZone: journey?.plan.departure.timeZone ?? reviewedPlan?.departure.timeZone })}. The original start is unchanged; nobody was notified.</p> : null}</div>
      {/* The same glance as a live journey: how long until you check in, and that nobody was told. */}
      <SkyCard state={skyAt(now !== null ? new Date(now) : null, null)} label="Manual progress" pulse="with-you" eyebrow="Your next check-in" aside="No GPS · no alerts"
        title={<span className="block"><span className="block text-[0.72rem] font-medium tracking-normal text-[color:var(--sky-muted)]">{remaining === 0 ? "Due" : "Check in within"}</span><span role="status" aria-live="polite" className="block text-[2.75rem] leading-none tabular-nums">{remaining === 0 ? "Now" : remaining}{remaining === 0 ? null : <span className="ml-2 text-lg font-normal">min</span>}</span></span>}
        line={<>Due {new Date(entry.dueAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", timeZone: journey?.plan.departure.timeZone })}{journey ? ` · ${journey.plan.departure.timeZone}` : ""}. Mira has not alerted anyone.</>} />
      <section aria-label="Check-in controls" className="flex flex-col gap-2">
        {journey?.option ? <div className="m-card p-4"><label className="block text-sm font-semibold">Manual progress · {journey.progress}%<input type="range" min={0} max={100} step={25} value={journey.progress} onChange={(e) => { markLocalProgress(Number(e.target.value));  }} className="mt-3 min-h-12 w-full accent-[var(--color-accent)]" /></label><details className="text-sm"><summary className="min-h-12 cursor-pointer py-3 font-semibold">Mapped route reference</summary><p className="text-ink-muted">These are mapped segments, not turn instructions or confirmation that you are on the route.</p><ol className="mt-3 list-decimal space-y-3 pl-5">{journey.option.steps?.map((step, i) => <li key={i}>{step.name || step.highway || "Pedestrian segment"} · {Math.round(step.lengthM)} m</li>)}</ol><Link href="/around/map" className="inline-flex min-h-12 items-center text-accent-strong">Open selected plan on map</Link></details></div> : null}
        {journey ? <><button type="button" onClick={recordLocalJourneyCheckIn} className="min-h-12 w-full rounded-2xl bg-surface font-semibold ring-1 ring-line-strong">Check in privately</button>{journey.checkedInAt ? <p role="status" className="px-1 text-xs text-ink-muted">Checked in at {new Date(journey.checkedInAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", timeZone: journey.plan.departure.timeZone })}. Your journey is still active; nobody was notified.</p> : null}</> : null}
        <button type="button" onClick={() => finish("arrived")} className="mira-primary w-full">I’m here — confirm arrival</button><button type="button" onClick={() => finish("ended")} className="min-h-12 w-full text-sm text-ink-muted">End journey early</button>
      </section>
      <button type="button" onClick={() => setUnsafe(true)} className="m-card m-press min-h-12 w-full font-semibold">I need options</button><p className="m-meta px-1">Manual progress is entered by you. Refresh needs an unexpired plan and a new route check; offline route restoration is unavailable. This check-in expires 30 minutes after due.</p>
    </>}
    </div><UnsafeSheet open={unsafe} onClose={() => setUnsafe(false)} me={null} area={null} helpPoints={[]} helpLoading={false} onGoHelpPoint={() => {}} goLabel="Show" share={null} tell={null} change={entry ? { label: "Review or change journey", detail: "Review the same private journey and manually confirm its continued origin. No GPS or contact alerts.", onReview: () => closeOverlayThen(() => setUnsafe(false), () => router.push("/plan/legs")) } : null} />
  </div>;
}
