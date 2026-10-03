"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api-client";
import { setPlanDraft } from "@/lib/plan-store";
import { activatePlanLeg, intentFromLeg, newPlanLeg, resolvedDestination, resolvedOrigin, returnLegFromMain, type PlanDraft, type PlanLegDraft, type PlanPlaceResolution } from "@/domain/plan-state";
import { instantForLocal } from "@/domain/plan-options";
import { statusWords, type CountryContext } from "@/domain/country-context";
import { TRAVEL_MODE_INFO, type TravelMode } from "@/domain/travel-mode";

type CountryChoice = { iso: string; name: string };
type PlaceHit = { id: string; name: string; kind: string; lat: number; lon: number };
type Lookup = { index: number; field: "origin" | "destination"; state: "loading" | "ready" | "empty" | "failed"; hits: PlaceHit[] };

function CountryEssentials({ iso }: { iso: string | null | undefined }) {
  const [entry, setEntry] = useState<{ iso: string; data: CountryContext | null; failed: boolean } | null>(null);
  useEffect(() => {
    if (!iso) return;
    let live = true;
    void api<CountryContext>("/api/plan/country", { body: { iso } }).then((result) => {
      if (live) setEntry({ iso, data: result.ok ? result.data : null, failed: !result.ok });
    });
    return () => { live = false; };
  }, [iso]);
  if (!iso) return <p className="text-sm text-ink-muted">Choose a destination country to see reviewed essentials. No country is inferred from your device.</p>;
  if (entry?.iso !== iso) return <p role="status" className="text-sm">Checking country coverage…</p>;
  if (entry.failed || !entry.data) return <p role="status" className="text-sm">Country coverage could not be checked. Do not rely on an emergency number from this plan; check an official local source.</p>;
  const ctx = entry.data;
  return <div className="space-y-1 text-sm" aria-label={`Coverage for ${ctx.countryName ?? iso}`}>
    <p><strong>{ctx.countryName}</strong> · emergency information {statusWords(ctx.emergency.status)}{ctx.emergency.reviewed ? ` · reviewed ${ctx.emergency.reviewed}` : ""}</p>
    {ctx.emergency.primary ? <p>Reviewed option for this destination: {ctx.emergency.primary.number} ({ctx.emergency.primary.label}{ctx.emergency.primary.qualification ? `; ${ctx.emergency.primary.qualification}` : ""}). Check the region and service before relying on it.</p> : <p>Local emergency number for this destination is not verified by MIRA. Check an official local source before travel.</p>}
    {ctx.emergency.limitations.length ? <p>Coverage limits: {ctx.emergency.limitations.join(" ")}</p> : null}
    {ctx.emergency.source ? <p>Source: <a className="underline" href={ctx.emergency.source.url} target="_blank" rel="noopener noreferrer">{ctx.emergency.source.title}</a></p> : null}
    <p className="text-xs text-ink-muted">This is destination planning, not your current emergency location. Route coverage, opening hours, transport service and local safety facts are checked separately.</p>
  </div>;
}

function legReady(leg: PlanLegDraft): boolean {
  const intent = intentFromLeg(leg);
  return Boolean(intent && resolvedOrigin(intent) && resolvedDestination(intent) && instantForLocal(leg.departureLocal, leg.timeZone));
}

function LegEvidence({ leg }: { leg: PlanLegDraft }) {
  const instant = instantForLocal(leg.departureLocal, leg.timeZone);
  return <div className="space-y-2 text-sm" role="status">
    <p>{instant ? `${leg.timeKind === "arrive_by" ? "Arrive by" : "Depart at"} ${leg.departureLocal.replace("T", " ")} (${leg.timeZone}).` : "Confirm a valid local date, time and IANA zone. Ambiguous or missing times cannot be reviewed."}</p>
    {!leg.origin.resolution || !leg.destination.resolution ? <p>Choose both place results before reviewing routes. Typed names stay here if search is unavailable.</p> : null}
    <p className="text-xs text-ink-muted">Review checks each route separately. Operator availability, property access and staffing remain unknown unless sourced evidence is shown.</p>
  </div>;
}

export function TravelLegs({ draft, countries, onReview }: { draft: PlanDraft; countries: CountryChoice[]; onReview?: () => void }) {
  const [lookup, setLookup] = useState<Lookup | null>(null);
  const [editing, setEditing] = useState<number | null>(() => {
    const index = (draft.legs ?? []).findIndex((leg) => !legReady(leg));
    return index < 0 ? null : index;
  });
  const requestVersion = useRef(0);
  const legs = draft.legs ?? [];
  const updateLeg = (index: number, patch: Partial<PlanLegDraft>) => {
    const next = [...legs];
    next[index] = { ...next[index], ...patch };
    setPlanDraft({ ...draft, legs: next, touched: true });
  };
  const find = async (index: number, field: "origin" | "destination") => {
    const version = ++requestVersion.current;
    const query = legs[index][field].query.trim();
    if (query.length < 2) return setLookup({ index, field, state: "empty", hits: [] });
    setLookup({ index, field, state: "loading", hits: [] });
    const result = await api<{ places: PlaceHit[] }>("/api/geo/search", { body: { q: query, near: null, deep: true, source: "osm" } });
    if (version !== requestVersion.current) return;
    setLookup({ index, field, state: result.ok ? result.data.places.length ? "ready" : "empty" : "failed", hits: result.ok ? result.data.places : [] });
  };
  const choose = (index: number, field: "origin" | "destination", hit: PlaceHit) => {
    requestVersion.current++;
    const resolution: PlanPlaceResolution = { source: "search", point: { lat: hit.lat, lon: hit.lon }, placeId: hit.id, name: hit.name };
    updateLeg(index, { [field]: { query: hit.id.startsWith("g:") ? legs[index][field].query : hit.name, resolution } });
    setLookup(null);
  };
  const countrySelect = (value: string, onChange: (iso: string | null) => void, label: string) => <label className="block text-sm font-semibold">{label}<select value={value} onChange={(e) => onChange(e.target.value || null)} className="mt-2 min-h-12 w-full rounded-xl bg-sunken px-3 outline-none focus:ring-2 focus:ring-accent text-base font-normal"><option value="">Country not selected</option>{countries.map((country) => <option key={country.iso} value={country.iso}>{country.name}</option>)}</select></label>;
  const mainInstant = instantForLocal(draft.departureLocal, draft.timeZone);
  const returnLeg = returnLegFromMain(draft);
  const add = (leg: PlanLegDraft) => {
    requestVersion.current++;
    setLookup(null);
    setEditing(legs.length);
    setPlanDraft({ ...draft, legs: [...legs, leg], touched: true });
  };
  const review = (index: number) => {
    if (!legReady(legs[index])) return;
    const next = activatePlanLeg(draft, index);
    if (!next) return;
    requestVersion.current++;
    setLookup(null);
    setEditing(null);
    setPlanDraft(next);
    onReview?.();
  };
  return <section className="space-y-4 m-card p-4 sm:p-5" aria-label="Travel legs">
    <header><h2 className="font-semibold">Your return and next legs</h2><p className="mt-1 text-sm text-ink-muted">Keep up to three movements together. Review and confirm each journey separately.</p></header>
    <div className="space-y-2 rounded-lg bg-sunken p-3" aria-label="Leg 1 summary">
      <h3 className="font-semibold">Leg 1 · {draft.activity || "main movement"}</h3>
      <p className="text-sm">{draft.origin.kind === "named" ? draft.origin.query || "Origin needed" : "Chosen device origin"} → {draft.loop ? "starting point (loop)" : draft.destination.query || "Destination needed"}</p>
      <p className="text-sm">{mainInstant ? `${draft.timeKind === "arrive_by" ? "Arrive by" : "Depart at"} ${draft.departureLocal.replace("T", " ")} (${draft.timeZone})` : "Confirm the main leg’s local time and zone in Plan."}</p>
      <details><summary className="min-h-12 cursor-pointer py-2 text-sm font-semibold">Destination facts for leg 1</summary><div className="space-y-3 pt-2">{countrySelect(draft.destinationCountryIso ?? "", (iso) => setPlanDraft({ ...draft, destinationCountryIso: iso, touched: true }), "Destination country for leg 1")}<CountryEssentials iso={draft.destinationCountryIso} /></div></details>
    </div>
    {draft.returnTimeHint ? <p role="status" className="rounded-lg border border-line p-3 text-sm"><strong>Return requested: {draft.returnTimeHint}.</strong> This is separate from the event’s arrival time. Confirm the return date and local time; neither has been guessed.</p> : null}
    {legs.map((leg, index) => {
      const ready = legReady(leg);
      const expanded = editing === index;
      const number = index + 2;
      return <section key={index} className="space-y-3 rounded-lg border border-line p-3" aria-label={`Leg ${number}`}>
        <div><h3 className="font-semibold">Leg {number} · {leg.label || "new movement"}</h3><p className="mt-1 text-sm">{leg.origin.query || "Origin needed"} → {leg.destination.query || "Destination needed"}</p><p className="mt-1 text-xs text-ink-muted">{ready ? `Places and timing complete · ${leg.departureLocal.replace("T", " ")} (${leg.timeZone}) · ${TRAVEL_MODE_INFO[leg.mode].label}. Route review is separate.` : "Draft saved here · confirm the missing places or local time."}</p></div>
        {!expanded ? <div className="flex flex-wrap gap-2"><button type="button" aria-expanded={false} aria-controls={`leg-${index}-editor`} onClick={() => { requestVersion.current++; setLookup(null); setEditing(index); }} className="min-h-12 rounded-full bg-surface px-4 ring-1 ring-line-strong text-sm font-semibold">Edit leg {number}</button><button type="button" disabled={!ready || !activatePlanLeg(draft, index)} onClick={() => review(index)} className="min-h-12 rounded-lg bg-accent px-3 text-sm font-semibold text-accent-ink disabled:opacity-50">Review leg {number} options</button></div> : <div id={`leg-${index}-editor`} className="space-y-3 border-t border-line pt-3">
          {leg.timeHint ? <p role="status" className="text-sm text-ink-muted">Requested for this leg: {leg.timeHint}. Confirm its date and local time below.</p> : null}
          <label className="block text-sm font-semibold">Leg {number} purpose<input value={leg.label} onChange={(e) => updateLeg(index, { label: e.target.value })} maxLength={160} placeholder="For example, airport to hotel" className="mt-2 min-h-12 w-full rounded-xl bg-sunken px-3 outline-none focus:ring-2 focus:ring-accent text-base font-normal" /></label>
          {(["origin", "destination"] as const).map((field) => <div key={field}><label className="block text-sm font-semibold" htmlFor={`leg-${index}-${field}`}>Leg {number} {field === "origin" ? "from" : "to"}</label><div className="mt-2 flex gap-2"><input id={`leg-${index}-${field}`} value={leg[field].query} onChange={(e) => { requestVersion.current++; updateLeg(index, { [field]: { query: e.target.value, resolution: null } }); setLookup(null); }} maxLength={160} placeholder={field === "origin" ? "Airport or station name" : "Hotel or destination name"} className="min-h-12 min-w-0 flex-1 rounded-xl bg-sunken px-3 outline-none focus:ring-2 focus:ring-accent text-base" /><button type="button" onClick={() => void find(index, field)} className="min-h-12 rounded-full bg-surface px-4 ring-1 ring-line-strong text-sm font-semibold">Find {field} for leg {number}</button></div>{leg[field].resolution ? <p className="text-xs text-accent-strong">Selected: {leg[field].resolution.name}</p> : null}{lookup?.index === index && lookup.field === field ? <div role="status" className="mt-2 text-sm">{lookup.state === "loading" ? "Looking for places…" : lookup.state === "failed" ? "Place search failed or quota was reached. Your typed name stays here; retry or check the provider directly." : lookup.state === "empty" ? "No matching place found. Try a fuller name or nearby landmark." : <><p>Choose the place you mean:</p>{lookup.hits.map((hit) => <button key={hit.id} type="button" onClick={() => choose(index, field, hit)} className="mt-1 min-h-12 w-full rounded-lg border border-line p-2 text-left">{hit.name} · {hit.kind}</button>)}</>}</div> : null}</div>)}
          <label className="block text-sm font-semibold">Leg {number} timing<select value={leg.timeKind ?? "depart_at"} onChange={(e) => updateLeg(index, { timeKind: e.target.value as "depart_at" | "arrive_by" })} className="mt-2 min-h-12 w-full rounded-xl bg-sunken px-3 outline-none focus:ring-2 focus:ring-accent"><option value="depart_at">Depart at</option><option value="arrive_by">Arrive by</option></select></label>
          <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm font-semibold">Leg {number} local {leg.timeKind === "arrive_by" ? "arrival" : "departure"}<input type="datetime-local" value={leg.departureLocal} onChange={(e) => updateLeg(index, { departureLocal: e.target.value })} className="mt-2 min-h-12 w-full rounded-xl bg-sunken px-3 outline-none focus:ring-2 focus:ring-accent text-base font-normal" /></label><label className="text-sm font-semibold">Leg {number} IANA time zone<input list="mira-time-zones" value={leg.timeZone} onChange={(e) => updateLeg(index, { timeZone: e.target.value })} placeholder="Europe/London" className="mt-2 min-h-12 w-full rounded-xl bg-sunken px-3 outline-none focus:ring-2 focus:ring-accent text-base font-normal" /></label></div>
          <p className="text-xs text-ink-muted">{leg.timeZone && leg.timeZone === draft.timeZone ? "The main leg’s chosen time zone is carried over. Confirm or edit it for this departure." : "Use the departure place’s local time zone. No phone time zone is substituted."}</p>
          <label className="block text-sm font-semibold">Leg {number} mode<select value={leg.mode} onChange={(e) => updateLeg(index, { mode: e.target.value as TravelMode })} className="mt-2 min-h-12 w-full rounded-xl bg-sunken px-3 outline-none focus:ring-2 focus:ring-accent text-base font-normal">{(["walk", "ride", "transit"] as const).map((mode) => <option key={mode} value={mode}>{TRAVEL_MODE_INFO[mode].label}</option>)}</select></label>
          <details><summary className="min-h-12 cursor-pointer py-2 text-sm font-semibold">Requirements and destination facts for leg {number}</summary><div className="space-y-3 pt-2"><label className="block text-sm font-semibold">Leg {number} constraints<input value={leg.constraints ?? ""} maxLength={500} onChange={(e) => updateLeg(index, { constraints: e.target.value })} className="mt-2 min-h-12 w-full rounded-xl bg-sunken px-3 outline-none focus:ring-2 focus:ring-accent text-base font-normal" /></label>{countrySelect(leg.destinationCountryIso ?? "", (iso) => updateLeg(index, { destinationCountryIso: iso }), `Destination country for leg ${number}`)}<CountryEssentials iso={leg.destinationCountryIso} /></div></details>
          <LegEvidence leg={leg} />
          <div className="flex flex-wrap gap-2"><button type="button" disabled={!ready} onClick={() => { requestVersion.current++; setLookup(null); setEditing(null); }} className="min-h-12 rounded-full bg-surface px-4 ring-1 ring-line-strong text-sm font-semibold disabled:opacity-50">Done editing leg {number}</button><button type="button" disabled={!ready || !activatePlanLeg(draft, index)} onClick={() => review(index)} className="min-h-12 rounded-lg bg-accent px-3 text-sm font-semibold text-accent-ink disabled:opacity-50">Review leg {number} options</button><button type="button" onClick={() => { requestVersion.current++; setLookup(null); setEditing(null); setPlanDraft({ ...draft, legs: legs.filter((_, i) => i !== index), touched: true }); }} className="min-h-12 px-2 text-sm text-ink-muted underline">Remove leg {number}</button></div>
        </div>}
        <p className="text-xs text-ink-muted">Review keeps the previous main leg and choices here. It does not start, save or share a journey.</p>
      </section>;
    })}
    {legs.length < 2 ? <div className="flex flex-col gap-2 sm:flex-row"><button type="button" onClick={() => add(newPlanLeg())} className="min-h-12 rounded-lg border border-line px-4 text-sm font-semibold">Add travel leg</button>{returnLeg ? <button type="button" onClick={() => add(returnLeg)} className="min-h-12 rounded-lg bg-accent px-4 text-sm font-semibold text-accent-ink">Add return leg</button> : null}</div> : <p className="text-sm text-ink-muted">Three legs are in this plan. Edit or remove one before adding another.</p>}
    <p className="text-xs text-ink-muted">A return leg initially goes back to your named origin; edit its destination if home is somewhere else. Temporary in this tab. Destination facts do not set your current Emergency location. No booking, contact message or journey starts from adding a leg.</p>
  </section>;
}
