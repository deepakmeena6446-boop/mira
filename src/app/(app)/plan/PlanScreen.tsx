"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SafetyAccess } from "@/components/app/SafetyAccess";
import { SignInSheet } from "@/components/app/SignInSheet";
import { Icon } from "@/components/ui/Icon";
import { api } from "@/lib/api-client";
import { freshLocation } from "@/lib/location-store";
import { clearPlanDraft, ensurePlanDraft, setPlanDraft, usePlanDraft } from "@/lib/plan-store";
import { intentFromDraft, resolvedDestination, resolvedOrigin, type PlanDraft, type PlanPlaceResolution } from "@/domain/plan-state";
import { TRAVEL_MODE_INFO, type TravelMode } from "@/domain/travel-mode";
import { TravelLegs } from "./TravelLegs";

type PlaceHit = { id: string; name: string; kind: string; lat: number; lon: number };
type Field = "origin" | "destination";
type Lookup = { field: Field; state: "loading" | "ready" | "empty" | "failed"; hits: PlaceHit[]; message?: string };

export function PlanScreen({ emailAlerts, signedIn, countries }: { emailAlerts: boolean; signedIn: boolean; countries: { iso: string; name: string }[] }) {
  const router = useRouter();
  const draft = usePlanDraft();
  const [lookup, setLookup] = useState<Lookup | null>(null);
  const lookupVersion = useRef(0);
  const [locationMessage, setLocationMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [signInOpen, setSignInOpen] = useState(false);
  useEffect(ensurePlanDraft, [draft]);
  if (!draft) return <main className="px-4 pt-8"><p role="status">Opening your plan…</p></main>;

  const intent = intentFromDraft(draft);
  const originPoint = intent ? resolvedOrigin(intent) : null;
  const destinationPoint = intent ? resolvedDestination(intent) : null;
  const ready = Boolean(intent && originPoint && (intent.loop || destinationPoint));
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
    if (!loc.point) return setLocationMessage("Location wasn’t available. Enter a named origin instead.");
    update({ origin: { kind: "device", use: "from_here", point: { lat: loc.point.lat, lon: loc.point.lon } } });
  };
  const save = async () => {
    if (!signedIn) return setSignInOpen(true);
    setSaving(true);
    setSaveMessage(null);
    const result = await api<{ plan: { id: string } }>("/api/me/plans", { body: { draft } });
    setSaving(false);
    setSaveMessage(result.ok ? "Saved to Journeys for 30 days. You can delete it there. No journey or sharing started." : result.message);
  };
  const fieldResults = (field: Field) => lookup?.field === field ? <div className="mt-2" role="status">
    {lookup.state === "loading" ? <p>Looking for places…</p> : lookup.state !== "ready" ? <p>{lookup.message}</p> : <><p className="mb-2">Choose the place you mean:</p><ul className="space-y-1">{lookup.hits.map((hit) => <li key={hit.id}><button type="button" onClick={() => choose(field, hit)} className="min-h-11 w-full rounded-lg border border-line bg-surface px-3 py-2 text-left"><strong className="block">{hit.name}</strong><span className="text-xs text-ink-muted">{hit.kind}</span></button></li>)}</ul></>}
  </div> : null;

  return <div className="bg-companion min-h-dvh px-4 pb-[calc(var(--tabbar-space)+2rem)] pt-[max(1.25rem,env(safe-area-inset-top))]">
    <div className="mx-auto flex max-w-xl flex-col gap-5">
      <header><Link href="/" className="inline-flex min-h-11 items-center gap-2 text-sm text-accent-strong"><Icon name="back" className="size-4" /> Go</Link><h1 className="mt-1 text-[1.9rem] font-semibold">Plan a movement</h1><p className="mt-1 text-sm text-ink-muted">Start with where and when you want to go. This plan stays in this tab for up to two hours unless you clear it.</p></header>
      <SafetyAccess emailAlerts={emailAlerts} />
      <section className="space-y-4 rounded-[var(--radius-lg)] border border-line bg-surface p-5" aria-label="Movement intent">
        <label className="block text-sm font-semibold">What do you want to do?<input value={draft.activity} onChange={(e) => update({ activity: e.target.value })} maxLength={160} placeholder="For example, go for an early run" className="mt-2 min-h-12 w-full rounded-lg border border-line-strong bg-canvas px-3 text-base font-normal" /></label>
        <div>
          <label className="block text-sm font-semibold" htmlFor="plan-origin">From</label>
          {draft.origin.kind === "named" ? <><div className="mt-2 flex gap-2"><input id="plan-origin" value={draft.origin.query} onChange={(e) => { lookupVersion.current += 1; update({ origin: { kind: "named", query: e.target.value, resolution: null } }); setLookup(null); }} maxLength={160} placeholder="Named origin, anywhere" className="min-h-12 min-w-0 flex-1 rounded-lg border border-line-strong bg-canvas px-3 text-base" /><button type="button" onClick={() => void search("origin")} className="min-h-11 rounded-lg border border-line px-3 text-sm font-semibold">Find</button></div>{draft.origin.resolution ? <p className="mt-1 text-xs text-accent-strong">Selected: {draft.origin.resolution.name}</p> : null}{fieldResults("origin")}</> : <p id="plan-origin" className="mt-2 text-sm">From here selected. Current position is used only because you chose it.</p>}
          <div className="mt-2 flex flex-wrap gap-2"><button type="button" onClick={() => { lookupVersion.current += 1; if (draft.origin.kind === "device") update({ origin: { kind: "named", query: "", resolution: null } }); }} className="min-h-11 rounded-lg border border-line px-3 text-sm">Use named origin</button><button type="button" onClick={() => void fromHere()} className="min-h-11 rounded-lg border border-line px-3 text-sm">From here</button></div>
          {locationMessage ? <p role="status" className="mt-2 text-sm text-warm">{locationMessage}</p> : null}
        </div>
        {draft.timeHint ? <p role="status" className="text-sm text-ink-muted">You mentioned {draft.timeHint}. Choose the date and time zone below; Mira has not assumed either.</p> : null}
        <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" checked={draft.loop} onChange={(e) => update({ loop: e.target.checked })} className="size-5" /> Return to my starting point (loop)</label>
        {!draft.loop ? <div><label className="block text-sm font-semibold" htmlFor="plan-destination">To</label><div className="mt-2 flex gap-2"><input id="plan-destination" value={draft.destination.query} onChange={(e) => { lookupVersion.current += 1; update({ destination: { query: e.target.value, resolution: null } }); setLookup(null); }} maxLength={160} placeholder="Named destination" className="min-h-12 min-w-0 flex-1 rounded-lg border border-line-strong bg-canvas px-3 text-base" /><button type="button" onClick={() => void search("destination")} className="min-h-11 rounded-lg border border-line px-3 text-sm font-semibold">Find</button></div>{draft.destination.resolution ? <p className="mt-1 text-xs text-accent-strong">Selected: {draft.destination.resolution.name}</p> : null}{fieldResults("destination")}</div> : null}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2"><label className="text-sm font-semibold">Planned local time<input type="datetime-local" value={draft.departureLocal} onChange={(e) => update({ departureLocal: e.target.value })} className="mt-2 min-h-12 w-full rounded-lg border border-line-strong bg-canvas px-3 text-base font-normal" /></label><label className="text-sm font-semibold">Time zone (IANA)<input value={draft.timeZone} onChange={(e) => update({ timeZone: e.target.value })} placeholder="Asia/Kolkata" className="mt-2 min-h-12 w-full rounded-lg border border-line-strong bg-canvas px-3 text-base font-normal" /></label></div>
        <label className="block text-sm font-semibold">Mode<select value={draft.mode} onChange={(e) => update({ mode: e.target.value as TravelMode })} className="mt-2 min-h-12 w-full rounded-lg border border-line-strong bg-canvas px-3 text-base font-normal">{(["walk", "ride", "transit"] as const).map((mode) => <option key={mode} value={mode}>{TRAVEL_MODE_INFO[mode].label}</option>)}</select></label>
        <label className="block text-sm font-semibold">Essential constraints (optional)<input value={draft.constraints} onChange={(e) => update({ constraints: e.target.value })} maxLength={500} placeholder="Separate with commas" className="mt-2 min-h-12 w-full rounded-lg border border-line-strong bg-canvas px-3 text-base font-normal" /></label>
      </section>
      <TravelLegs draft={draft} countries={countries} />
      <section className="rounded-[var(--radius-lg)] border border-line bg-surface p-5" aria-label="Plan state">
        <h2 className="font-semibold">Current plan</h2>
        {!intent ? <p role="status" className="mt-2 text-sm text-ink-muted">Add an activity, origin, destination or loop, and a valid local time zone. Your entries stay here while you work.</p> : <><p className="mt-2 text-sm">{intent.activity} · {intent.origin.kind === "device" ? "From here" : intent.origin.query}{intent.loop ? " · loop" : ` → ${intent.destination?.query}`} · {intent.departure.local} ({intent.departure.timeZone}) · {TRAVEL_MODE_INFO[intent.mode].label}</p>{!ready ? <p role="status" className="mt-2 text-sm text-ink-muted">{!originPoint ? "Choose an origin search result. " : ""}{!intent.loop && !destinationPoint ? "Choose a destination search result." : ""} Your named places stay in the plan; Mira won’t replace them with your current location.</p> : <p role="status" className="mt-2 text-sm text-accent-strong">Places resolved. Open Around to compare mapped walking options and see what remains unknown at your planned time.</p>}</>}
        {intent?.loop ? <p className="mt-2 text-sm text-ink-muted">Loop routing is not available yet. You can inspect the starting area and choose a route manually.</p> : null}
        <div className="mt-4 flex flex-wrap gap-2"><button type="button" disabled={!intent} onClick={() => router.push("/around")} className="min-h-11 rounded-lg bg-accent px-4 text-sm font-semibold text-accent-ink disabled:opacity-50">View in Around</button><button type="button" disabled={!intent} onClick={() => router.push("/around/map")} className="min-h-11 rounded-lg border border-line px-4 text-sm font-semibold disabled:opacity-50">Open map</button><button type="button" disabled={!intent || saving} onClick={() => void save()} className="min-h-11 rounded-lg border border-line px-4 text-sm font-semibold disabled:opacity-50">{saving ? "Saving…" : "Save plan"}</button><button type="button" onClick={() => { lookupVersion.current += 1; clearPlanDraft(); ensurePlanDraft(); setLookup(null); setSaveMessage(null); }} className="min-h-11 rounded-lg border border-line px-4 text-sm font-semibold">Clear plan</button></div>
        {saveMessage ? <p role="status" className="mt-2 text-sm text-ink-muted">{saveMessage}</p> : null}
      </section>
      <SignInSheet open={signInOpen} onClose={() => setSignInOpen(false)} reason="Sign in to save this plan" />
    </div>
  </div>;
}
