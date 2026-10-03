"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { EmergencyPill } from "@/components/app/EmergencyPill";
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
  return <div className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-5 px-5 pb-[calc(var(--tabbar-space)+2rem)] pt-[max(1.5rem,env(safe-area-inset-top))]">
    <header className="flex items-center justify-between gap-3"><Link href="/" className="mira-wordmark">mira<span aria-hidden>↗</span></Link><EmergencyPill /></header>
    <div><p className="mira-eyebrow">Private · manual journey</p><h1 className="mt-2 text-3xl font-semibold">{closed === "arrived" ? "You’ve arrived." : closed === "ended" ? "Journey ended." : journey?.plan.loop ? "Your way around." : journey?.plan.destination?.query ?? "Your manual journey."}</h1><p className="mt-2 text-sm text-ink-muted">Route review and your own check-in. No GPS, monitoring, contact alerts or automatic arrival.</p></div>
    {!hydrated ? <p role="status">Opening your journey…</p> : !entry ? <><section className="mira-journey-hero" role="status"><p>{closed === "arrived" ? "Arrival was confirmed by you. Nothing was sent to contacts." : closed === "ended" ? "You ended early; this is not recorded as arrival." : "No private check-in is active in this tab."}</p>{returnPlan ? <button type="button" className="mira-primary mt-4" onClick={() => { setPlanDraft(returnPlan); router.push("/plan?planStep=options"); }}>Review return journey</button> : <Link href="/plan" className="mira-primary mt-4">Return to plan</Link>}</section>{!returnPlan ? <SavedReturnReview /> : null}</> : <>
      {journey?.option ? <RoutePreview option={journey.option} /> : null}
      {restoreMessage ? <p role="status" className="text-sm text-warm">{restoreMessage}</p> : null}
      <div className="rounded-2xl border border-line bg-surface p-4"><Link href="/plan" className="inline-flex min-h-12 items-center font-semibold text-accent-strong">Review or change this journey</Link><p className="text-sm text-ink-muted">Review the plan and manually confirm the origin for your continued journey. A separate confirmation updates this same private journey; Mira does not replace your origin with GPS.</p>{updatedAt ? <p role="status" className="mt-2 text-sm text-ink-muted">Journey update confirmed at {new Date(updatedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", timeZone: journey?.plan.departure.timeZone ?? reviewedPlan?.departure.timeZone })}. The original start is unchanged; nobody was notified.</p> : null}</div>
      <section className="mira-journey-hero" aria-label="Manual progress"><p className="mira-eyebrow">Your next check-in</p><p role="status" aria-live="polite" className="mira-journey-number mt-4">{remaining === 0 ? "Now" : remaining}<span className="ml-2 text-lg font-normal">{remaining === 0 ? "" : "min"}</span></p><p className="mt-3 text-sm text-ink-muted">Due {new Date(entry.dueAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", timeZone: journey?.plan.departure.timeZone })}{journey ? ` · ${journey.plan.departure.timeZone}` : ""}. Mira has not alerted anyone.</p>
        {journey?.option ? <><label className="mt-5 block text-sm font-semibold">Manual progress · {journey.progress}%<input type="range" min={0} max={100} step={25} value={journey.progress} onChange={(e) => { markLocalProgress(Number(e.target.value));  }} className="mt-3 min-h-12 w-full accent-[var(--color-accent)]" /></label><details className="text-sm"><summary className="min-h-12 cursor-pointer py-3 font-semibold">Mapped route reference</summary><p className="text-ink-muted">These are mapped segments, not turn instructions or confirmation that you are on the route.</p><ol className="mt-3 list-decimal space-y-3 pl-5">{journey.option.steps?.map((step, i) => <li key={i}>{step.name || step.highway || "Pedestrian segment"} · {Math.round(step.lengthM)} m</li>)}</ol><Link href="/around/map" className="inline-flex min-h-12 items-center text-accent-strong">Open selected plan on map</Link></details></> : null}
        {journey ? <><button type="button" onClick={recordLocalJourneyCheckIn} className="mira-intent-chip mt-4 w-full justify-center">Check in privately</button>{journey.checkedInAt ? <p role="status" className="mt-2 text-xs text-ink-muted">Checked in at {new Date(journey.checkedInAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", timeZone: journey.plan.departure.timeZone })}. Your journey is still active; nobody was notified.</p> : null}</> : null}
        <button type="button" onClick={() => finish("arrived")} className="mira-primary mt-4 w-full">I’m here — confirm arrival</button><button type="button" onClick={() => finish("ended")} className="mt-2 min-h-12 w-full text-sm text-ink-muted">End journey early</button>
      </section>
      <button type="button" onClick={() => setUnsafe(true)} className="mira-intent-chip justify-center">I need options</button><p className="text-xs text-ink-muted">Manual progress is entered by you. Refresh needs an unexpired plan and a new route check; offline route restoration is unavailable. This check-in expires 30 minutes after due.</p>
    </>}
    <UnsafeSheet open={unsafe} onClose={() => setUnsafe(false)} me={null} area={null} helpPoints={[]} helpLoading={false} onGoHelpPoint={() => {}} goLabel="Show" share={null} tell={null} change={entry ? { label: "Review or change journey", detail: "Review the same private journey and manually confirm its continued origin. No GPS or contact alerts.", onReview: () => closeOverlayThen(() => setUnsafe(false), () => router.push("/plan")) } : null} />
  </div>;
}
