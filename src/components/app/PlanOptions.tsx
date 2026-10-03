"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import { daylightAt, instantForLocal, planOptionsKey, planSelectionContext, type PlanOption, type PlanOptionsResult } from "@/domain/plan-options";
import { currentPlanDraft, setPlanDraft, usePlanDraft } from "@/lib/plan-store";
import type { MovementIntent } from "@/domain/plan-contract";
import { resolvedOrigin } from "@/domain/plan-state";
import { Icon } from "@/components/ui/Icon";

const unknownText = (reason: string) => ({ not_checked: "Not checked", no_data: "No data in checked source", provider_failed: "Source check failed", stale: "Source is too old", conflicting: "Calculation is ambiguous", unsupported: "No eligible planned-time service source" }[reason] ?? "Unknown");
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
    {!key ? <p role="status">Choose the named places you mean. Your current location will not be substituted.</p> : !current ? <div role="status" className="rounded-2xl bg-sunken p-4">Checking mapped routes and daylight…</div> : current.error ? <div role="status" className="rounded-2xl border border-line bg-surface p-4"><p>Route check failed: {current.error}. {localDaylight ? `Calculated daylight: ${localDaylight} (approximate).` : "Daylight is unknown."} Your plan stays here.</p><button type="button" onClick={() => setRetry((n) => n + 1)} className="mira-intent-chip mt-3">Retry mapped check</button></div> : data ? <>
      {selectionUnavailable ? <p role="status" className="rounded-2xl bg-warm-soft p-4 text-sm">Your previous route choice is no longer in this checked response. Review and choose an available option before starting.</p> : null}
      {plan.loop && plan.loopTarget?.kind === "duration" && picked && Math.abs(picked.minutes - plan.loopTarget.value) > 2 ? <p role="status" className="rounded-2xl bg-sunken p-4 text-sm">You requested {plan.loopTarget.value} minutes. This mapped option is about {Math.round(picked.minutes)} minutes at your assumed pace. This choice does not match your target exactly; review this difference or edit the target.</p> : null}
      {data.options.length ? <ol className="space-y-3" aria-label="Walking options">{data.options.map((option, index) => <li key={option.id}><button type="button" aria-pressed={selected === index} onClick={() => { chosenInTab = { key, index }; const draft = currentPlanDraft(); if (draft) setPlanDraft({ ...draft, selection: { optionId: option.id, context: planSelectionContext(plan) } }); setSelected(index); }} className="mira-option"><span className="mira-option-title"><strong>{option.label}</strong><Icon name={selected === index ? "check" : "route"} className="size-5" /></span><span className="mt-3 flex items-baseline gap-3"><span className="text-2xl font-semibold">{Math.round(option.minutes)} <span className="text-sm font-normal">min</span></span><span className="text-sm text-ink-muted">{(option.meters / 1000).toFixed(1)} km</span></span>{option.departureLocal ? <span className="mt-2 block text-sm">Depart {option.departureLocal.replace("T", " ")}{option.arrivalLocal ? ` · arrive about ${option.arrivalLocal.replace("T", " ")}` : ""}</span> : null}<span className="mt-2 block text-xs text-ink-muted">{option.evidence[0]?.status === "known" ? `${option.evidence[0].source.label} · mapped estimate` : "Evidence unavailable"}</span></button></li>)}</ol> : <div role="status" className="rounded-2xl border border-line bg-surface p-4"><p>{data.detail}</p><p className="mt-2 text-sm text-ink-muted">You can keep the named plan, confirm the route directly and start a manual check-in journey.</p>{data.state === "failed" || data.state === "stale" ? <button type="button" onClick={() => setRetry((n) => n + 1)} className="mira-intent-chip mt-3">Retry mapped check</button> : null}</div>}
      <div className="rounded-2xl bg-sunken p-4 text-sm"><strong>Daylight {plan.timeKind === "arrive_by" ? "at estimated departure" : "at departure"}</strong><p className="mt-1">{daylight?.status === "known" ? `${daylight.value} · approximate solar calculation` : unknownText(daylight?.reason ?? "not_checked")}. Lighting, activity and access are checked separately.</p></div>
      {data.timeAlternatives?.map((time) => <div key={time.local} className="rounded-2xl border border-line p-4 text-sm"><strong>Later time option</strong><p className="mt-1">Calculated daylight by about {time.local.replace("T", " ")} ({time.timeZone}), {time.minutesLater} minutes later. Lighting remains unknown.</p>{onTimeChoice ? <button type="button" onClick={() => onTimeChoice(time.local)} className="mira-intent-chip mt-2">Compare this departure</button> : null}</div>)}
      {data.manualPlan ? <div className="rounded-2xl border border-line p-4 text-sm"><strong>{plan.mode === "ride" ? "Ride / car" : "Transit"}: confirm directly</strong><ul className="mt-2 list-disc space-y-1 pl-4">{data.manualPlan.nextSteps.map((step) => <li key={step}>{step}</li>)}</ul></div> : null}
      {data.constraints?.length ? <div className="rounded-2xl border border-line p-4 text-sm"><strong>Your requirements</strong>{data.constraints.map((constraint) => <p key={constraint.text} className="mt-2">{constraint.text}: {constraint.reason}</p>)}</div> : null}
      <details className="text-sm text-ink-muted"><summary className="min-h-12 cursor-pointer py-3 font-semibold">Sources, freshness and limits</summary><p>{data.detail}</p><p className="mt-2">{data.source ?? "Source unavailable"} · {data.sourceAt ? `snapshot ${new Date(data.sourceAt).toLocaleDateString()}` : "snapshot unknown"} · checked {new Date(data.checkedAt).toLocaleString()} · {data.scope ?? "scope unknown"}</p><p className="mt-2">{data.service.status === "unknown" ? unknownText(data.service.reason) : String(data.service.value)}. Mapped distance does not establish safety, accessibility or operating service. Opening hours, lighting and staffing remain unverified unless separately shown.</p>{picked?.steps?.length ? <ol className="mt-3 list-decimal space-y-2 pl-5" aria-label="Mapped route reference">{picked.steps.map((step, i) => <li key={i}>{step.name || step.highway || "Mapped pedestrian segment"} · {Math.round(step.lengthM)} m</li>)}</ol> : null}</details>
    </> : null}
  </section>;
}
