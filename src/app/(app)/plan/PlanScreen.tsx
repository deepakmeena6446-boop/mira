"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { SafetyAccess } from "@/components/app/SafetyAccess";
import { SignInSheet } from "@/components/app/SignInSheet";
import { Icon } from "@/components/ui/Icon";
import { api } from "@/lib/api-client";
import { freshLocation, locationUsable } from "@/lib/location-store";
import { clearPlanDraft, currentPlanDraft, ensurePlanDraft, setPlanDraft, usePlanDraft } from "@/lib/plan-store";
import { intentFromDraft, resolvedDestination, resolvedOrigin, type PlanDraft, type PlanPlaceResolution } from "@/domain/plan-state";
import { TRAVEL_MODE_INFO, type TravelMode } from "@/domain/travel-mode";
import { TravelLegs } from "./TravelLegs";
import { saveEligibility, TAB_PLAN_NOTE } from "@/domain/plan-save";
import { usePlanStep } from "@/lib/use-plan-step";
import { PlanOptions } from "@/components/app/PlanOptions";
import { PlanJourneyControls } from "@/components/app/PlanJourneyControls";
import { DesktopPlanMap, InspectPlanMap } from "@/components/app/PlanMap";
import { PlanConversation } from "@/components/app/PlanConversation";
import { TimeZoneChoices } from "@/components/app/TimeZoneChoices";
import { planOptionsKey, type PlanOption } from "@/domain/plan-options";

type PlaceHit = { id: string; name: string; kind: string; lat: number; lon: number };
type Field = "origin" | "destination";
type Lookup = { field: Field; state: "loading" | "ready" | "empty" | "failed"; hits: PlaceHit[]; message?: string };

export function PlanScreen({ emailAlerts, signedIn, countries, embedded = false }: { emailAlerts: boolean; signedIn: boolean; countries: { iso: string; name: string }[]; embedded?: boolean }) {
  const draft = usePlanDraft();
  const [lookup, setLookup] = useState<Lookup | null>(null);
  const lookupVersion = useRef(0);
  const [locationMessage, setLocationMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveFeedback, setSaveFeedback] = useState<{ context: PlanDraft | null; text: string } | null>(null);
  const saveMessage = saveFeedback?.context === draft ? saveFeedback?.text : null;
  const [signInOpen, setSignInOpen] = useState(false);
  const [step, setStep] = usePlanStep();
  const [choice, setChoice] = useState<{ key: string; option: PlanOption } | null>(null);
  const chooseOption = useCallback((option: PlanOption | null, key: string) => setChoice(option ? { key, option } : null), []);
  useEffect(ensurePlanDraft, [draft]);
  if (!draft) return <main className="px-4 pt-8"><p role="status">Opening your plan…</p></main>;

  const intent = intentFromDraft(draft);
  const originPoint = intent ? resolvedOrigin(intent) : null;
  const destinationPoint = intent ? resolvedDestination(intent) : null;
  const ready = Boolean(intent && originPoint && (intent.loop || destinationPoint));
  const nextQuestion = !originPoint ? "Where are you leaving from?" : !draft.loop && !destinationPoint ? "Which destination do you mean?" : !draft.departureLocal || !draft.timeZone ? "What local date, time and time zone should this plan use?" : "Ready to compare the available options.";
  const update = (patch: Partial<PlanDraft>) => setPlanDraft({ ...draft, ...patch, touched: true });
  const search = async (field: Field) => {
    const version = ++lookupVersion.current;
    const query = field === "origin" && draft.origin.kind === "named" ? draft.origin.query.trim() : field === "destination" ? draft.destination.query.trim() : "";
    if (query.length < 2) {
      setLookup({ field, state: "empty", hits: [], message: "Enter at least two characters." });
      return;
    }
    setLookup({ field, state: "loading", hits: [] });
    const result = await api<{ places: PlaceHit[] }>("/api/geo/search", { body: { q: query, near: null, deep: true, source: "osm" } });
    if (version !== lookupVersion.current) return;
    if (!result.ok) return setLookup({ field, state: "failed", hits: [], message: result.network ? "Search is offline. Your plan is still here; retry when connected." : "Couldn’t check places. Your plan is still here; retry." });
    setLookup({ field, state: result.data.places.length ? "ready" : "empty", hits: result.data.places, message: result.data.places.length ? undefined : "No matching place found. Try a fuller name or nearby landmark." });
  };
  const choose = (field: Field, hit: PlaceHit) => {
    lookupVersion.current += 1;
    const resolution: PlanPlaceResolution = { source: "search", point: { lat: hit.lat, lon: hit.lon }, placeId: hit.id, name: hit.name };
    // Google result content is transient: persist the user's own typed query only.
    if (field === "origin") update({ origin: { kind: "named", query: hit.id.startsWith("g:") && draft.origin.kind === "named" ? draft.origin.query : hit.name, resolution } });
    else update({ destination: { query: hit.id.startsWith("g:") ? draft.destination.query : hit.name, resolution } });
    setLookup(null);
  };
  const fromHere = async () => {
    lookupVersion.current += 1;
    setLocationMessage(null);
    const loc = await freshLocation();
    if (!locationUsable(loc) || !loc.point) return setLocationMessage("A fresh, accurate location wasn’t available. Enter a named origin instead.");
    update({ origin: { kind: "device", use: "from_here", point: { lat: loc.point.lat, lon: loc.point.lon } } });
  };
  // The same save rules as the brief, said before the tap (sprint 01 save boundary); the server stays authoritative.
  const eligibility = saveEligibility(draft, { signedIn });
  const blocked = !eligibility.ok && eligibility.code !== "guest" ? eligibility : null;
  const save = async () => {
    if (blocked) return;
    if (!signedIn) return setSignInOpen(true);
    setSaving(true);
    setSaveFeedback(null);
    const result = await api<{ plan: { id: string } }>("/api/me/plans", { body: { draft } });
    setSaving(false);
    setSaveFeedback({ context: currentPlanDraft(), text: result.ok ? currentPlanDraft() === draft ? "Saved to Journeys for 30 days. You can delete it there. No journey or sharing started." : "The version you submitted was saved to Journeys. Your newer edits are not included; save again to keep them." : result.network ? `You’re offline, so nothing was saved. ${TAB_PLAN_NOTE}` : result.message });
  };
  const fieldResults = (field: Field) => lookup?.field === field ? <div className="mt-2" role="status">
    {lookup.state === "loading" ? <p>Looking for places…</p> : lookup.state !== "ready" ? <p>{lookup.message}</p> : <><p className="mb-2">Choose the place you mean:</p><ul className="space-y-1">{lookup.hits.map((hit) => <li key={hit.id}><button type="button" onClick={() => choose(field, hit)} className="min-h-12 w-full m-card px-3 py-2 text-left"><strong className="block">{hit.name}</strong><span className="text-xs text-ink-muted">{hit.kind}</span></button></li>)}</ul></>}
  </div> : null;

  return <div className="m-screen bg-companion">
    <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[minmax(0,600px)_minmax(0,1fr)]"><div className="flex min-w-0 flex-col gap-5">
      <header><div className="flex items-center justify-between gap-3"><Link href="/plan" aria-label="Back to plan" className="grid size-11 shrink-0 place-items-center rounded-full bg-surface ring-1 ring-line"><Icon name="back" className="size-5" /></Link><SafetyAccess emailAlerts={emailAlerts} compact className="min-w-0" /></div><div className="mt-5 flex items-end justify-between gap-3"><p className="m-label">Detailed planner</p><button type="button" onClick={() => { lookupVersion.current++; clearPlanDraft(); if (!embedded) ensurePlanDraft(); setLookup(null); setStep(0); }} className="min-h-11 text-sm font-semibold text-accent-strong">New plan</button></div><h1 className="m-display mt-1">Let’s make it work.</h1><p className="mt-1 text-[0.95rem] text-ink-muted">{draft.activity || "Start with where and when you want to go."}</p></header>
      <nav className="grid grid-cols-3 gap-1 rounded-2xl bg-sunken p-1" aria-label="Plan steps">{["Plan", "Options", "Return & legs"].map((label, index) => <button key={label} type="button" aria-current={step === index ? "step" : undefined} onClick={() => setStep(index)} className={step === index ? "flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-surface text-sm font-semibold shadow-[var(--shadow-float)]" : "flex min-h-11 items-center justify-center gap-1.5 rounded-xl text-sm font-semibold text-ink-muted"}><span className="text-xs text-ink-subtle">{index + 1}</span>{label}</button>)}</nav>
      {step === 0 ? <section className="space-y-4 m-card p-4" aria-label="Movement intent">
        <p className="text-base font-semibold" role="status">{nextQuestion}</p>
        <label className="block text-sm font-semibold">What do you want to do?<input value={draft.activity} onChange={(e) => update({ activity: e.target.value })} maxLength={160} placeholder="For example, go for an early run" className="mt-2 min-h-12 w-full rounded-xl bg-sunken px-3 outline-none focus:ring-2 focus:ring-accent text-base font-normal" /></label>
        <div>
          <label className="block text-sm font-semibold" htmlFor="plan-origin">From</label>
          {draft.origin.kind === "named" ? <><div className="mt-2 flex gap-2"><input id="plan-origin" value={draft.origin.query} onChange={(e) => { lookupVersion.current += 1; update({ origin: { kind: "named", query: e.target.value, resolution: null } }); setLookup(null); }} maxLength={160} placeholder="Named origin, anywhere" className="min-h-12 min-w-0 flex-1 rounded-xl bg-sunken px-3 outline-none focus:ring-2 focus:ring-accent text-base" /><button type="button" onClick={() => void search("origin")} className="min-h-12 rounded-full bg-surface px-4 ring-1 ring-line-strong text-sm font-semibold">Find</button></div>{draft.origin.resolution ? <p className="mt-1 text-xs text-accent-strong">Selected: {draft.origin.resolution.name}</p> : null}{fieldResults("origin")}</> : <p id="plan-origin" className="mt-2 text-sm">From here selected. Current position is used only because you chose it.</p>}
          <div className="mt-2 flex flex-wrap gap-2"><button type="button" onClick={() => { lookupVersion.current += 1; if (draft.origin.kind === "device") update({ origin: { kind: "named", query: "", resolution: null } }); }} className="min-h-12 rounded-full bg-surface px-4 ring-1 ring-line-strong text-sm">Use named origin</button><button type="button" onClick={() => void fromHere()} className="min-h-12 rounded-full bg-surface px-4 ring-1 ring-line-strong text-sm">From here</button></div>
          {locationMessage ? <p role="status" className="mt-2 text-sm text-warm">{locationMessage}</p> : null}
        </div>
        {draft.timeHint ? <p role="status" className="text-sm text-ink-muted">You mentioned {draft.timeHint}. Choose the date and time zone below; Mira has not assumed either.</p> : null}
        <label className="flex min-h-12 items-center gap-3 text-sm"><input type="checkbox" checked={draft.loop} onChange={(e) => update({ loop: e.target.checked })} className="size-5" /> Return to my starting point (loop)</label>
        {draft.loop ? <div className="grid grid-cols-2 gap-3"><label className="text-sm font-semibold">Loop duration (minutes)<input type="number" min={5} max={235} value={draft.loopTarget?.kind === "duration" ? draft.loopTarget.value : 30} onChange={(e) => update({ loopTarget: { kind: "duration", value: Number(e.target.value) } })} className="mt-2 min-h-12 w-full rounded-xl bg-sunken px-3 outline-none focus:ring-2 focus:ring-accent" /></label><label className="text-sm font-semibold">Pace (min / km)<input type="number" min={2} max={30} step={0.5} value={draft.paceMinutesPerKm ?? (/run/i.test(draft.activity) ? 6 : Number((60 / 4.5).toFixed(2)))} onChange={(e) => update({ paceMinutesPerKm: Number(e.target.value) })} className="mt-2 min-h-12 w-full rounded-xl bg-sunken px-3 outline-none focus:ring-2 focus:ring-accent" /></label><p className="col-span-2 text-xs text-ink-muted">Editable planning estimate, not a measured pace or prediction.</p></div> : null}
        {!draft.loop ? <div><label className="block text-sm font-semibold" htmlFor="plan-destination">To</label><div className="mt-2 flex gap-2"><input id="plan-destination" value={draft.destination.query} onChange={(e) => { lookupVersion.current += 1; update({ destination: { query: e.target.value, resolution: null } }); setLookup(null); }} maxLength={160} placeholder="Named destination" className="min-h-12 min-w-0 flex-1 rounded-xl bg-sunken px-3 outline-none focus:ring-2 focus:ring-accent text-base" /><button type="button" onClick={() => void search("destination")} className="min-h-12 rounded-full bg-surface px-4 ring-1 ring-line-strong text-sm font-semibold">Find</button></div>{draft.destination.resolution ? <p className="mt-1 text-xs text-accent-strong">Selected: {draft.destination.resolution.name}</p> : null}{fieldResults("destination")}</div> : null}
        <label className="block text-sm font-semibold">Timing<select value={draft.timeKind ?? "depart_at"} onChange={(e) => update({ timeKind: e.target.value as "depart_at" | "arrive_by" })} className="mt-2 min-h-12 w-full rounded-xl bg-sunken px-3 outline-none focus:ring-2 focus:ring-accent"><option value="depart_at">Depart at</option><option value="arrive_by">Arrive by</option></select></label>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2"><label className="text-sm font-semibold">Planned local time<input type="datetime-local" value={draft.departureLocal} onChange={(e) => update({ departureLocal: e.target.value })} className="mt-2 min-h-12 w-full rounded-xl bg-sunken px-3 outline-none focus:ring-2 focus:ring-accent text-base font-normal" /></label><label className="text-sm font-semibold">Time zone (IANA)<input list="mira-time-zones" value={draft.timeZone} onChange={(e) => update({ timeZone: e.target.value })} placeholder="Asia/Kolkata" className="mt-2 min-h-12 w-full rounded-xl bg-sunken px-3 outline-none focus:ring-2 focus:ring-accent text-base font-normal" /></label></div>
        <label className="block text-sm font-semibold">Mode<select value={draft.mode} onChange={(e) => update({ mode: e.target.value as TravelMode })} className="mt-2 min-h-12 w-full rounded-xl bg-sunken px-3 outline-none focus:ring-2 focus:ring-accent text-base font-normal">{(["walk", "ride", "transit"] as const).map((mode) => <option key={mode} value={mode}>{TRAVEL_MODE_INFO[mode].label}</option>)}</select></label>
        <details><summary className="min-h-12 cursor-pointer py-3 text-sm font-semibold">Requirements & accessibility</summary><label className="block text-sm font-semibold">Essential constraints (optional)<input value={draft.constraints} onChange={(e) => update({ constraints: e.target.value })} maxLength={500} placeholder="Separate with commas" className="mt-2 min-h-12 w-full rounded-xl bg-sunken px-3 outline-none focus:ring-2 focus:ring-accent text-base font-normal" /></label></details>
      </section> : null}
      {step === 2 ? <><p className="text-sm text-ink-muted">{draft.returnTimeHint ? `You mentioned a return around ${draft.returnTimeHint}. Confirm its date and local time below.` : "Plan the way back or your next transfer. Each leg keeps its own time and evidence."}</p><TravelLegs draft={draft} countries={countries} onReview={() => setStep(1)} />{draft.legs?.length ? <section aria-label="Keep this return plan" className="m-card p-4"><h2 className="font-semibold">Keep the way back</h2><p className="mt-2 text-sm text-ink-muted">This tab’s plan expires two hours after the last edit. For a longer night out, complete each leg and choose to save the plan to your account for 30 days. You can review its saved return from the journey screen. Saving starts no journey and shares nothing.</p><button type="button" disabled={!intent || saving || Boolean(blocked)} onClick={() => void save()} className="mira-intent-chip mt-3 justify-center disabled:opacity-50">{saving ? "Saving…" : "Save plan and return"}</button>{blocked ? <p role="status" className="mt-2 text-sm text-ink-muted">{blocked.message}</p> : null}{saveMessage ? <p role="status" className="mt-2 text-sm text-ink-muted">{saveMessage}</p> : null}</section> : null}</> : null}
      {step === 1 ? intent ? <><PlanOptions plan={intent} onChoice={chooseOption} onTimeChoice={(local) => update({ departureLocal: local, timeKind: "depart_at" })} /><InspectPlanMap plan={intent} option={choice?.key === planOptionsKey(intent) ? choice.option : null} /><PlanJourneyControls plan={intent} option={choice?.key === planOptionsKey(intent) ? choice.option : null} signedIn={signedIn} emailAlerts={emailAlerts} /><PlanConversation plan={intent} /></> : <p role="status">Complete the places and local time in Plan first. Your entries are still here.</p> : null}
      {step === 0 ? <section className="m-card p-4" aria-label="Plan state">
        <h2 className="font-semibold">Current plan</h2>
        {!intent ? <p role="status" className="mt-2 text-sm text-ink-muted">Add an activity, origin, destination or loop, and a valid local time zone. Your entries stay here while you work.</p> : <><p className="mt-2 text-sm">{intent.activity} · {intent.origin.kind === "device" ? "From here" : intent.origin.query}{intent.loop ? " · loop" : ` → ${intent.destination?.query}`} · {intent.departure.local} ({intent.departure.timeZone}) · {TRAVEL_MODE_INFO[intent.mode].label}</p>{!ready ? <p role="status" className="mt-2 text-sm text-ink-muted">{!originPoint ? "Choose an origin search result. " : ""}{!intent.loop && !destinationPoint ? "Choose a destination search result." : ""} Your named places stay in the plan; Mira won’t replace them with your current location.</p> : <p role="status" className="mt-2 text-sm text-accent-strong">Places resolved. Compare the available routes, timing and explicit unknowns.</p>}</>}
        <div className="mt-4 flex flex-wrap gap-2"><button type="button" disabled={!intent} onClick={() => setStep(1)} className="mira-primary w-full">Compare my options <Icon name="chevron" /></button><button type="button" disabled={!intent || saving || Boolean(blocked)} onClick={() => void save()} className="min-h-12 px-2 text-sm font-semibold text-accent-strong disabled:opacity-50">{saving ? "Saving…" : "Save plan"}</button><button type="button" onClick={() => { lookupVersion.current += 1; clearPlanDraft(); ensurePlanDraft(); setLookup(null); setSaveFeedback(null); }} className="min-h-12 px-2 text-sm text-ink-muted">Clear plan</button></div>
        {intent && blocked ? <p role="status" className="mt-2 text-sm text-ink-muted">{blocked.message}</p> : null}
        {saveMessage ? <p role="status" className="mt-2 text-sm text-ink-muted">{saveMessage}</p> : null}
      </section> : null}
      <TimeZoneChoices />
      <p className="text-xs text-ink-muted">Temporary in this tab · expires two hours after the last edit · saving and sharing are your choice.</p>
      <SignInSheet open={signInOpen} onClose={() => setSignInOpen(false)} reason="Sign in to save this plan" />
    </div><aside className="hidden lg:block">{intent && ready ? <div className="sticky top-8"><DesktopPlanMap plan={intent} option={choice?.key === planOptionsKey(intent) ? choice.option : null} /></div> : <div className="sticky top-8 rounded-3xl bg-sunken p-8"><p className="m-label">Make the next move clear</p><p className="mt-4 text-2xl font-semibold">Your places, timing and choices. Together.</p><p className="mt-4 text-sm text-ink-muted">Choose the named places you mean. The map appears here after they resolve; planning works without location permission.</p></div>}</aside></div>
  </div>;
}
