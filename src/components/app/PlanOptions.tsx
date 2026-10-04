"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import { daylightAt, instantForLocal, planOptionsKey, planSelectionContext, type PlanOption, type PlanOptionsResult } from "@/domain/plan-options";
import { currentPlanDraft, setPlanDraft, usePlanDraft } from "@/lib/plan-store";
import type { MovementIntent } from "@/domain/plan-contract";
import { resolvedOrigin } from "@/domain/plan-state";
import { Icon } from "@/components/ui/Icon";
import { clockIn } from "@/domain/daylight";

const unknownText = (reason: string) => ({ not_checked: "Not checked", no_data: "No data", provider_failed: "Couldn’t check", stale: "Data too old", conflicting: "Unclear", unsupported: "Mira can’t check services at that time" }[reason] ?? "Unknown");
let chosenInTab: { key: string; index: number } | null = null;
export function clearPlanOptionChoice() { chosenInTab = null; }
export function PlanOptions({ plan, onRoute, onChoice, onTimeChoice }: { plan: MovementIntent; onRoute?: (geometry: [number, number][] | null) => void; onChoice?: (option: PlanOption | null, key: string) => void; onTimeChoice?: (local: string) => void }) {
  const draft = usePlanDraft();
  const from = resolvedOrigin(plan);
  const key = planOptionsKey(plan);
  const [result, setResult] = useState<{ key: string; data: PlanOptionsResult | null; error: string | null } | null>(null);
  const [selected, setSelected] = useState(0);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!key) return;
    let live = true;
    void api<PlanOptionsResult>("/api/plan/options", { body: { intent: plan } }).then((reply) => {
      if (live) { setResult({ key, data: reply.ok ? reply.data : null, error: reply.ok ? null : reply.message }); const selection = currentPlanDraft()?.selection; const stored = selection?.context === planSelectionContext(plan) && reply.ok ? reply.data.options.findIndex((option) => option.id === selection.optionId) : -1; setSelected(stored >= 0 ? stored : chosenInTab?.key === key && reply.ok ? Math.min(chosenInTab.index, Math.max(0, reply.data.options.length - 1)) : 0); }
    });
    return () => { live = false; };
    // The canonical key includes every field affecting this response.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, retry]);
  const current = result?.key === key ? result : null;
  const data = current?.data;
  const picked = data?.options[selected] ?? null;
  const daylight = picked?.daylight ?? data?.daylight;
  const selectionUnavailable = Boolean(data && draft?.selection?.context === planSelectionContext(plan) && !data.options.some((option) => option.id === draft.selection?.optionId));
  useEffect(() => { onRoute?.(picked?.geometry.length && data?.state === "ready" ? picked.geometry : null); }, [onRoute, picked, data]);
  useEffect(() => { onChoice?.(data?.state === "ready" ? picked : null, key); }, [onChoice, picked, data, key]);
  const localInstant = from ? instantForLocal(plan.departure.local, plan.departure.timeZone) : null;
  const localDaylight = from && localInstant && Math.abs(from.lat) <= 72 ? daylightAt(localInstant, from) : null;
  return <section aria-label="Plan options" className="space-y-4">
    <header><p className="m-label">Your options</p><h2 className="mt-1 text-xl font-semibold">{plan.mode !== "walk" ? "Make the transfer work" : plan.loop ? "Choose your way around" : "Choose your way there"}</h2><p className="mt-1 text-sm text-ink-muted">{plan.timeKind === "arrive_by" ? "Arrive by" : "Depart at"} {plan.departure.local.replace("T", " ")} · {plan.departure.timeZone}</p></header>
    {!key ? <p role="status">Pick the places you mean from the search results — Mira won’t swap in your current location.</p> : !current ? <div role="status" className="rounded-2xl bg-sunken p-4">Checking routes and daylight…</div> : current.error ? <div role="status" className="rounded-2xl border border-line bg-surface p-4"><p>Couldn’t check routes: {current.error}. {localDaylight ? `Daylight: ${localDaylight} (approximate).` : "Daylight unknown."} Your plan is kept.</p><button type="button" onClick={() => setRetry((n) => n + 1)} className="mira-intent-chip mt-3">Try again</button></div> : data ? <>
      {selectionUnavailable ? <p role="status" className="rounded-2xl bg-warm-soft p-4 text-sm">Your earlier route isn’t in these results any more — pick one before you start.</p> : null}
      {plan.loop && plan.loopTarget?.kind === "duration" && picked && Math.abs(picked.minutes - plan.loopTarget.value) > 2 ? <p role="status" className="rounded-2xl bg-sunken p-4 text-sm">This loop is about {Math.round(picked.minutes)} min at your pace, not the {plan.loopTarget.value} you asked for — pick another or change the target.</p> : null}
      {data.options.length ? <ol className="space-y-3" aria-label="Walking options">{data.options.map((option, index) => <li key={option.id}><button type="button" aria-pressed={selected === index} onClick={() => { chosenInTab = { key, index }; const draft = currentPlanDraft(); if (draft) setPlanDraft({ ...draft, selection: { optionId: option.id, context: planSelectionContext(plan) } }); setSelected(index); }} className="mira-option"><span className="mira-option-title"><strong>{option.label}</strong><Icon name={selected === index ? "check" : "route"} className="size-5" /></span><span className="mt-3 flex items-baseline gap-3"><span className="text-2xl font-semibold">{Math.round(option.minutes)} <span className="text-sm font-normal">min</span></span><span className="text-sm text-ink-muted">{(option.meters / 1000).toFixed(1)} km</span></span>{option.departureLocal ? <span className="mt-2 block text-sm">Depart {option.departureLocal.replace("T", " ")}{option.arrivalLocal ? ` · arrive about ${option.arrivalLocal.replace("T", " ")}` : ""}</span> : null}<span className="mt-2 block text-xs text-ink-muted">{option.evidence[0]?.status === "known" ? `${option.evidence[0].source.label} · estimate` : "No source"}</span></button></li>)}</ol> : <div role="status" className="rounded-2xl border border-line bg-surface p-4"><p>{data.detail}</p><p className="mt-2 text-sm text-ink-muted">You can still keep this plan and start a check-in journey yourself.</p>{data.state === "failed" || data.state === "stale" ? <button type="button" onClick={() => setRetry((n) => n + 1)} className="mira-intent-chip mt-3">Try again</button> : null}</div>}
      <div className="rounded-2xl bg-sunken p-4 text-sm"><strong>Daylight {plan.timeKind === "arrive_by" ? "at estimated departure" : "at departure"}</strong><p className="mt-1">{daylight?.status === "known" ? `${daylight.value} (approximate)` : `${unknownText(daylight?.reason ?? "not_checked")}.`}</p></div>
      {data.timeAlternatives?.map((time) => <div key={time.local} className="rounded-2xl border border-line p-4 text-sm"><strong>Later time option</strong><p className="mt-1">Daylight by about {time.local.replace("T", " ")} ({time.timeZone}), {time.minutesLater} minutes later.</p>{onTimeChoice ? <button type="button" onClick={() => onTimeChoice(time.local)} className="mira-intent-chip mt-2">Compare this departure</button> : null}</div>)}
      {data.manualPlan ? <div className="rounded-2xl border border-line p-4 text-sm"><strong>{plan.mode === "ride" ? "Ride / car" : "Transit"}: confirm directly</strong><ul className="mt-2 list-disc space-y-1 pl-4">{data.manualPlan.nextSteps.map((step) => <li key={step}>{step}</li>)}</ul></div> : null}
      {data.constraints?.length ? <div className="rounded-2xl border border-line p-4 text-sm"><strong>Your requirements</strong>{data.constraints.map((constraint) => <p key={constraint.text} className="mt-2">{constraint.text}: {constraint.reason}</p>)}</div> : null}
      <details className="text-sm text-ink-muted"><summary className="min-h-12 cursor-pointer py-3 font-semibold">Sources and what Mira can’t see</summary><p>{data.detail}</p><p className="mt-2">{data.source ?? "No source"} · {data.sourceAt ? `map data from ${new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(new Date(data.sourceAt))}` : "map date unknown"} · checked at {clockIn(data.checkedAt)}{data.scope ? ` · ${data.scope}` : ""}</p><p className="mt-2">Services: {data.service.status === "unknown" ? unknownText(data.service.reason) : String(data.service.value)}. Mira can’t see opening hours, lighting, staffing or access here.</p>{picked?.steps?.length ? <ol className="mt-3 list-decimal space-y-2 pl-5" aria-label="Mapped route reference">{picked.steps.map((step, i) => <li key={i}>{step.name || step.highway || "Mapped pedestrian segment"} · {Math.round(step.lengthM)} m</li>)}</ol> : null}</details>
    </> : null}
  </section>;
}
