"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api-client";
import { setPlanDraft } from "@/lib/plan-store";
import { activatePlanLeg, intentFromDraft, intentFromLeg, newPlanLeg, resolvedDestination, resolvedOrigin, returnLegFromMain, type PlanDraft, type PlanLegDraft, type PlanPlaceResolution } from "@/domain/plan-state";
import { instantForLocal } from "@/domain/plan-options";
import { haversineMeters } from "@/domain/pilot";
import { statusWords, type CountryContext } from "@/domain/country-context";
import { TRAVEL_MODE_INFO, type TravelMode } from "@/domain/travel-mode";
import { PlanOptions } from "@/components/app/PlanOptions";

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

function LegEvidence({ leg }: { leg: PlanLegDraft }) {
  const intent = intentFromLeg(leg);
  const instant = instantForLocal(leg.departureLocal, leg.timeZone);
  const from = intent ? resolvedOrigin(intent) : null;
  const to = intent ? resolvedDestination(intent) : null;
  const localWalk = from && to && haversineMeters(from, to) <= 25_000;
  return <div className="mt-3 space-y-2 border-t border-line pt-3 text-sm">
    <p>{instant ? `Local departure ${leg.departureLocal} (${leg.timeZone}) = ${instant.toISOString()} UTC.` : "Local departure time is invalid, ambiguous, or missing in this time zone. Clarify the date, time and IANA zone before relying on timing."}</p>
    {!intent ? <p role="status">Enter a leg purpose, both named places, a local time and a valid time zone.</p> : !from || !to ? <p role="status">Choose both place search results. Typed names are retained if search is unavailable; no current location is substituted.</p> : localWalk ? <PlanOptions plan={intent} /> : <p role="status">These places are outside the 25 km imported walking comparison. A route and transfer time are not verified. Check the transport operator or a provider directly and arrange your own transfer.</p>}
    <p>Late ride or transit availability, hotel desk hours, airport exits and station facilities are not verified for this planned time. Confirm them directly with the operator or property; no booking has been made.</p>
  </div>;
}

export function TravelLegs({ draft, countries }: { draft: PlanDraft; countries: CountryChoice[] }) {
  const router = useRouter();
  const [lookup, setLookup] = useState<Lookup | null>(null);
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
    const query = hit.id.startsWith("g:") ? legs[index][field].query : hit.name;
    updateLeg(index, { [field]: { query, resolution } });
    setLookup(null);
  };
  const countrySelect = (value: string, onChange: (iso: string | null) => void, label: string) => <label className="block text-sm font-semibold">{label}<select value={value} onChange={(e) => onChange(e.target.value || null)} className="mt-2 min-h-12 w-full rounded-lg border border-line-strong bg-canvas px-3 text-base font-normal"><option value="">Country not selected</option>{countries.map((country) => <option key={country.iso} value={country.iso}>{country.name}</option>)}</select></label>;
  const mainIntent = intentFromDraft(draft);
  const mainInstant = instantForLocal(draft.departureLocal, draft.timeZone);
  const returnLeg = returnLegFromMain(draft);
  return <section className="space-y-4 rounded-[var(--radius-lg)] border border-line bg-surface p-5" aria-label="Travel legs">
    <h2 className="font-semibold">Travel legs and destination facts</h2>
    <p className="text-sm text-ink-muted">Build up to three separate movements in this tab. Enter local times for each departure; MIRA never assumes the phone’s current time zone for another city.</p>
    <div className="space-y-2 rounded-lg border border-line p-3" aria-label="Leg 1 coverage">
      <h3 className="font-semibold">Leg 1 · {draft.activity || "main movement"}</h3>
      <p className="text-sm">{mainInstant ? `Local departure ${draft.departureLocal} (${draft.timeZone}) = ${mainInstant.toISOString()} UTC.` : "Local time is invalid, ambiguous, or missing in this time zone; clarify it before relying on timing."}</p>
      {countrySelect(draft.destinationCountryIso ?? "", (iso) => setPlanDraft({ ...draft, destinationCountryIso: iso, touched: true }), "Destination country for leg 1")}
      <CountryEssentials iso={draft.destinationCountryIso} />
      {mainIntent && resolvedOrigin(mainIntent) && resolvedDestination(mainIntent) && haversineMeters(resolvedOrigin(mainIntent)!, resolvedDestination(mainIntent)!) > 25_000 ? <p className="text-sm">This leg is outside the imported local walking comparison. Check an operator or provider for the transfer; availability and opening hours are unverified.</p> : null}
    </div>
    {legs.map((leg, index) => <div key={index} className="space-y-3 rounded-lg border border-line p-3" aria-label={`Leg ${index + 2}`}>
      <div className="flex items-center justify-between gap-2"><h3 className="font-semibold">Leg {index + 2} · {leg.label || "movement"}</h3><button type="button" className="min-h-11 text-sm underline" onClick={() => { requestVersion.current++; setLookup(null); setPlanDraft({ ...draft, legs: legs.filter((_, i) => i !== index), touched: true }); }}>Remove leg {index + 2}</button></div>
      <label className="block text-sm font-semibold">Leg {index + 2} purpose<input value={leg.label} onChange={(e) => updateLeg(index, { label: e.target.value })} maxLength={160} placeholder="For example, airport to hotel" className="mt-2 min-h-12 w-full rounded-lg border border-line-strong bg-canvas px-3 text-base font-normal" /></label>
      {(["origin", "destination"] as const).map((field) => <div key={field}><label className="block text-sm font-semibold" htmlFor={`leg-${index}-${field}`}>Leg {index + 2} {field === "origin" ? "from" : "to"}</label><div className="mt-2 flex gap-2"><input id={`leg-${index}-${field}`} value={leg[field].query} onChange={(e) => { requestVersion.current++; updateLeg(index, { [field]: { query: e.target.value, resolution: null } }); setLookup(null); }} maxLength={160} placeholder={field === "origin" ? "Airport or station name" : "Hotel or destination name"} className="min-h-12 min-w-0 flex-1 rounded-lg border border-line-strong bg-canvas px-3 text-base" /><button type="button" onClick={() => void find(index, field)} className="min-h-11 rounded-lg border border-line px-3 text-sm font-semibold">Find {field} for leg {index + 2}</button></div>{leg[field].resolution ? <p className="text-xs text-accent-strong">Selected: {leg[field].resolution.name}</p> : null}{lookup?.index === index && lookup.field === field ? <div role="status" className="mt-2 text-sm">{lookup.state === "loading" ? "Looking for places…" : lookup.state === "failed" ? "Place search failed or quota was reached. Keep the typed name and retry or confirm directly with the provider." : lookup.state === "empty" ? "No matching place found. Try the full airport, station or hotel name." : <><p>Choose the place you mean:</p>{lookup.hits.map((hit) => <button key={hit.id} type="button" onClick={() => choose(index, field, hit)} className="mt-1 min-h-11 w-full rounded-lg border border-line p-2 text-left">{hit.name} · {hit.kind}</button>)}</>}</div> : null}</div>)}
      <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm font-semibold">Leg {index + 2} local departure<input type="datetime-local" value={leg.departureLocal} onChange={(e) => updateLeg(index, { departureLocal: e.target.value })} className="mt-2 min-h-12 w-full rounded-lg border border-line-strong bg-canvas px-3 text-base font-normal" /></label><label className="text-sm font-semibold">Leg {index + 2} IANA time zone<input value={leg.timeZone} onChange={(e) => updateLeg(index, { timeZone: e.target.value })} placeholder="Europe/London" className="mt-2 min-h-12 w-full rounded-lg border border-line-strong bg-canvas px-3 text-base font-normal" /></label></div>
      <label className="block text-sm font-semibold">Leg {index + 2} mode<select value={leg.mode} onChange={(e) => updateLeg(index, { mode: e.target.value as TravelMode })} className="mt-2 min-h-12 w-full rounded-lg border border-line-strong bg-canvas px-3 text-base font-normal">{(["walk", "ride", "transit"] as const).map((mode) => <option key={mode} value={mode}>{TRAVEL_MODE_INFO[mode].label}</option>)}</select></label>
      {countrySelect(leg.destinationCountryIso ?? "", (iso) => updateLeg(index, { destinationCountryIso: iso }), `Destination country for leg ${index + 2}`)}
      <CountryEssentials iso={leg.destinationCountryIso} />
      <LegEvidence leg={leg} />
      <button type="button" disabled={!activatePlanLeg(draft, index)} onClick={() => { const next = activatePlanLeg(draft, index); if (next) { setPlanDraft(next); router.push("/around"); } }} className="min-h-11 rounded-lg border border-line px-4 text-sm font-semibold disabled:opacity-50">Review leg {index + 2} in Around</button>
      <p className="text-xs text-ink-muted">Reviewing this leg keeps the previous main leg here. It does not start a journey or notify contacts.</p>
    </div>)}
    {legs.length < 2 ? <div className="flex flex-wrap gap-2"><button type="button" onClick={() => setPlanDraft({ ...draft, legs: [...legs, newPlanLeg()], touched: true })} className="min-h-11 rounded-lg border border-line px-4 text-sm font-semibold">Add travel leg</button>{returnLeg ? <button type="button" onClick={() => setPlanDraft({ ...draft, legs: [...legs, returnLeg], touched: true })} className="min-h-11 rounded-lg border border-line px-4 text-sm font-semibold">Add return leg</button> : null}</div> : null}
    <p className="text-xs text-ink-muted">This plan is temporary. Country profiles are destination facts, not a current-location emergency action. No booking, contact or journey starts from adding a leg.</p>
  </section>;
}
