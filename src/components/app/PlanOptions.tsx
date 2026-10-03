"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import { daylightAt, instantForLocal, laterDaylight, type PlanOption, type PlanOptionsResult } from "@/domain/plan-options";
import type { MovementIntent } from "@/domain/plan-contract";
import { resolvedDestination, resolvedOrigin } from "@/domain/plan-state";

const unknownText = (reason: string) => ({ not_checked: "Not checked", no_data: "No data in checked source", provider_failed: "Source check failed", stale: "Source is too old", conflicting: "Too close to sunrise or sunset to call", unsupported: "No verified planned-time service source" }[reason] ?? "Unknown");
let chosenInTab: { key: string; index: number } | null = null;

export function PlanOptions({ plan, onRoute, onChoice }: { plan: MovementIntent; onRoute?: (geometry: [number, number][] | null) => void; onChoice?: (option: PlanOption | null, key: string) => void }) {
  const from = resolvedOrigin(plan);
  const to = plan.loop && from ? { name: "Starting point", ...from } : resolvedDestination(plan);
  const key = from && to ? JSON.stringify({ from, to: { lat: to.lat, lon: to.lon }, departure: plan.departure, mode: plan.mode }) : "";
  const [result, setResult] = useState<{ key: string; data: PlanOptionsResult | null; error: string | null } | null>(null);
  const [selected, setSelected] = useState(0);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!key) return;
    const { from, to, departure } = JSON.parse(key) as { from: { lat: number; lon: number }; to: { lat: number; lon: number }; departure: MovementIntent["departure"] };
    const request = { from, to, departure };
    let live = true;
    void api<PlanOptionsResult>("/api/plan/options", { body: request }).then((reply) => {
      if (live) { setResult({ key, data: reply.ok ? reply.data : null, error: reply.ok ? null : reply.message }); setSelected(chosenInTab?.key === key && reply.ok ? Math.min(chosenInTab.index, Math.max(0, reply.data.options.length - 1)) : 0); }
    });
    return () => { live = false; };
  }, [key, retry]);
  const current = result?.key === key ? result : null;
  const picked = current?.data?.options[selected] ?? null;
  const localInstant = from ? instantForLocal(plan.departure.local, plan.departure.timeZone) : null;
  const localDaylight = from && localInstant && Math.abs(from.lat) <= 72 ? daylightAt(localInstant, from) : null;
  const retryButton = <button type="button" onClick={() => { setResult(null); setRetry((value) => value + 1); }} className="mt-2 min-h-11 rounded-lg border border-line px-4 font-semibold">Retry mapped check</button>;
  useEffect(() => { onRoute?.(picked?.geometry.length && current?.data?.state === "ready" ? picked.geometry : null); }, [onRoute, picked, current]);
  useEffect(() => { onChoice?.(current?.data?.state === "ready" ? picked : null, key); }, [onChoice, picked, current, key]);
  if (plan.loop) {
    const later = from && current?.data?.daylight.status === "known" && current.data.daylight.value === "dark" ? laterDaylight(plan.departure.local, plan.departure.timeZone, from) : null;
    return <section aria-label="Plan options" className="rounded-lg border border-line bg-surface p-4 text-sm"><h2 className="font-semibold">Plan options</h2><p className="mt-2">Loop routing is unavailable. Choose a destination to compare mapped walking paths, or choose a different departure time.</p>{!from ? <p role="status" className="mt-2">Choose a named starting place first.</p> : !current ? <p role="status" className="mt-2">Calculating daylight at your starting place…</p> : current.error ? <div role="status" className="mt-2"><p>Mapped check failed: {current.error}. {localDaylight ? `Calculated daylight on this device: ${localDaylight} (approximate solar calculation; weather and shade excluded).` : "Daylight is unknown."} Lighting and activity remain unknown.</p>{retryButton}</div> : current.data ? <div className="mt-2"><p>Daylight at departure: {current.data.daylight.status === "known" ? `${current.data.daylight.value} · ${current.data.daylight.source.label} · calculated ${new Date(current.data.daylight.source.observedAt).toLocaleString()}` : unknownText(current.data.daylight.reason)}</p>{later ? <p className="mt-2">Later time option: calculated daylight by about {later.local.replace("T", " ")} ({plan.departure.timeZone}), {later.minutesLater} minutes later. This is an approximate solar calculation, not a route or lighting check.</p> : null}<p>Lighting and activity on a loop are unknown. Running time is unknown. Planned ride and transit service is unverified.</p></div> : null}</section>;
  }
  if (!from || !to) return <section aria-label="Plan options" className="rounded-lg border border-line bg-surface p-4 text-sm"><h2 className="font-semibold">Plan options</h2><p role="status" className="mt-2">Choose both named places before comparing routes. Your current location will not be substituted.</p></section>;
  return <section aria-label="Plan options" className="rounded-lg border border-line bg-surface p-4 text-sm">
    <h2 className="font-semibold">{plan.mode === "walk" ? "Compare mapped walks" : "Mapped walking reference"}</h2>
    <p className="mt-1 text-ink-muted">{plan.departure.local} ({plan.departure.timeZone}) · {plan.origin.kind === "device" ? "From here" : plan.origin.query} → {plan.destination?.query}</p>
    {plan.mode !== "walk" ? <p className="mt-2 text-sm text-ink-muted">You selected {plan.mode}. The paths below are walking estimates only. {plan.mode === "ride" ? "Driver, pickup and last-leg access" : "Service hours, stops and last-leg access"} are unverified for this time; confirm with the operator or provider.</p> : null}
    {!current ? <p role="status" className="mt-3">Checking the imported walking graph…</p> : current.error ? <div role="status" className="mt-3"><p>Route check failed: {current.error}. {localDaylight ? `Calculated daylight on this device: ${localDaylight} (approximate solar calculation; weather and shade excluded).` : "Daylight is unknown."} Route and service remain unknown.</p>{retryButton}</div> : current.data ? <>
      <p role="status" className="mt-3">{current.data.detail}</p>
      {current.data.options.length ? <ol className="mt-3 space-y-2" aria-label="Walking options">{current.data.options.map((option, index) => <li key={option.id}><button type="button" aria-pressed={selected === index} onClick={() => { chosenInTab = { key, index }; setSelected(index); }} className="min-h-11 w-full rounded-lg border border-line-strong p-3 text-left aria-pressed:border-accent"><strong>{option.label}</strong><span className="block">About {Math.round(option.minutes)} min · {(option.meters / 1000).toFixed(1)} km</span><span className="block text-xs text-ink-muted">{option.evidence[0].status === "known" ? `${option.evidence[0].source.label} · imported ${new Date(option.evidence[0].source.observedAt).toLocaleDateString()} · route scope ${current.data?.scope}` : "Source unknown"}</span></button></li>)}</ol> : null}
      <dl className="mt-3 space-y-2 border-t border-line pt-3"><div><dt className="font-semibold">Daylight at departure</dt><dd>{current.data.daylight.status === "known" ? `${current.data.daylight.value} · ${current.data.daylight.source.label} · calculated ${new Date(current.data.daylight.source.observedAt).toLocaleString()} · near origin` : unknownText(current.data.daylight.reason)}</dd></div><div><dt className="font-semibold">Ride or transit at planned time</dt><dd>{current.data.service.status === "unknown" ? unknownText(current.data.service.reason) : String(current.data.service.value)}</dd></div><div><dt className="font-semibold">Lighting and opening hours</dt><dd>Not verified for the planned time. Check directly before relying on a place.</dd></div></dl>
      <p className="mt-3 text-xs text-ink-muted">Mapped distance does not establish safety, accessibility, live conditions or service availability. Route geometry follows mapped graph edges only; access from each selected place to the graph may need checking.</p>
    </> : null}
  </section>;
}
