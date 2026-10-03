"use client";
import { useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { SafetyAccess } from "@/components/app/SafetyAccess";
import { hasPlanWork, newPlanDraft } from "@/domain/plan-state";
import { draftFromAsk } from "@/domain/plan-ask";
import { currentPlanDraft, setPlanDraft, usePlanDraft } from "@/lib/plan-store";
import { immediateSupportIntent } from "@/domain/ask-routing";
import type { MovementIntentHints } from "@/domain/plan-intent";
import { api } from "@/lib/api-client";
import { useLocalJourneyActive } from "@/lib/local-check-in-store";
import type { TripView } from "@/server/trips";
import type { SavedPlan } from "@/server/account/saved-plans";
import { PlanScreen } from "./plan/PlanScreen";
const examples = ["Dinner at 9. I'll leave around midnight and head home.", "A 30-minute run at 4:45 AM", "Airport to hotel after a late arrival"];
export function GoScreen({ name, trip, savedPlan, emailAlerts, countries }: { name: string | null; trip: TripView | null; savedPlan: SavedPlan | null; emailAlerts: boolean; countries: { iso: string; name: string }[] }) {
  const draft = usePlanDraft();
  const manualActive = useLocalJourneyActive();
  const [input, setInput] = useState("");
  const active = trip && (trip.state === "active" || trip.state === "missed") ? trip : null;
  const submit = () => {
    if (!input.trim()) return;
    if (immediateSupportIntent(input)) { window.dispatchEvent(new Event("mira:need-options")); return; }
    let zone = "UTC";
    try { zone = Intl.DateTimeFormat().resolvedOptions().timeZone; localStorage.setItem("mira.welcomed", "1"); } catch { /* optional device convenience only */ }
    const base = newPlanDraft(new Date(), zone);
    setPlanDraft(draftFromAsk(input, base));
    const initial = currentPlanDraft();
    void api<{ hints: MovementIntentHints | null }>("/api/mira/intent", { body: { message: input } }).then((r) => { if (r.ok && r.data.hints && currentPlanDraft() === initial) setPlanDraft(draftFromAsk(input, base, r.data.hints)); });
  };
  if (!active && !manualActive && hasPlanWork(draft)) return <PlanScreen embedded signedIn={Boolean(name)} emailAlerts={emailAlerts} countries={countries} />;
  return <div className="mira-workspace min-h-dvh px-5 pb-[calc(var(--tabbar-space)+1.5rem)] pt-[max(1.5rem,env(safe-area-inset-top))]">
    <div className="mx-auto max-w-2xl">
      <header className="flex items-center justify-between"><Link href="/" className="mira-wordmark">mira<span aria-hidden>↗</span></Link><span className="text-xs font-medium text-ink-muted">{name ? `Hi, ${name.split(" ")[0]}` : "Your movement companion"}</span></header>
      {active ? <section className="mira-journey-hero mt-8" aria-label="Active journey"><span className="mira-eyebrow">{active.state === "missed" ? "Check-in due" : "In motion"}</span><h1 className="mt-3 text-3xl font-semibold">{active.autoArrival ? `On your way to ${active.destination.name}` : "Your journey is active"}</h1><p className="mt-3 text-ink-muted">{active.sharedWith.length ? `Sharing with ${active.sharedWith.map((c) => c.name).join(", ")}` : "Private journey"}</p><Link href="/trip" className="mira-primary mt-6">Open your journey <Icon name="route" /></Link><SafetyAccess className="mt-4" emailAlerts={emailAlerts} /></section> : manualActive ? <section className="mira-journey-hero mt-8" aria-label="Active manual journey"><p className="mira-eyebrow">In motion · private manual journey</p><h1 className="mt-3 text-3xl font-semibold">Your journey is active.</h1><p className="mt-3 text-sm text-ink-muted">Your route review, progress and private check-in stay in this tab. No GPS or monitoring is active.</p><Link href="/trip/local" className="mira-primary mt-6">Open your journey <Icon name="route" /></Link><SafetyAccess className="mt-4" emailAlerts={emailAlerts} /></section> : <>
        <section className="pb-5 pt-12 sm:pt-16" aria-label="Start a plan">
          <p className="mira-eyebrow">Go somewhere. Feel prepared.</p><h1 className="mt-4 max-w-lg text-[2.65rem] font-semibold leading-[1.07] tracking-[-0.045em] sm:text-6xl">What’s your plan?</h1>
          <p className="mt-4 max-w-md text-base leading-relaxed text-ink-muted">Compare routes and timing. Make a plan, move with it, and get support along the way.</p>
          <form className="mira-composer mt-8" onSubmit={(e) => { e.preventDefault(); submit(); }}>
            <label htmlFor="go-intent" className="sr-only">Your movement plan</label><textarea id="go-intent" value={input} onChange={(e) => setInput(e.target.value)} maxLength={1000} rows={3} placeholder="Dinner tonight, then home around midnight…" />
            <div className="flex items-center justify-between gap-3"><Link href="/plan" className="min-h-12 py-3 text-sm font-medium text-ink-muted">Enter places instead</Link><button type="submit" disabled={!input.trim()} className="mira-primary">Let’s plan <Icon name="chevron" /></button></div>
          </form>
          <p className="mt-2 text-[11px] leading-relaxed text-ink-subtle">Submitted text may be interpreted by the configured AI provider. Movement planning is not saved to account chat history. <Link href="/privacy" className="underline">Data details</Link></p>
          <div className="mt-4 flex flex-wrap gap-2" aria-label="Example plans">{examples.map((example, i) => <button key={example} type="button" onClick={() => setInput(example)} className="mira-intent-chip"><Icon name={i === 0 ? "route" : i === 1 ? "walk" : "pin"} className="size-4" />{["Night out → home", "Early run", "Late arrival"][i]}</button>)}</div>
          <p className="mt-5 text-xs leading-relaxed text-ink-subtle">Built for women’s everyday movement and travel. Start without an account or location permission.</p>
        </section>
        <SafetyAccess emailAlerts={emailAlerts} className="mt-5" />
        {savedPlan ? <button type="button" onClick={() => setPlanDraft({ ...savedPlan.draft, touched: true })} className="mt-6 flex min-h-16 w-full items-center gap-3 rounded-2xl border border-line bg-surface p-4 text-left"><Icon name="route" /><span className="flex-1"><span className="mira-eyebrow">Saved by you</span><strong className="mt-1 block">{savedPlan.draft.activity}</strong></span><Icon name="chevron" /></button> : null}
      </>}
    </div>
  </div>;
}
