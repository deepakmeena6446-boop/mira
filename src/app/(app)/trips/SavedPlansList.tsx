"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api-client";
import { setPlanDraft } from "@/lib/plan-store";
import { intentFromDraft, type PlanDraft } from "@/domain/plan-state";

type Saved = { id: string; draft: PlanDraft; createdAt: string; expiresAt: string };

export function SavedPlansList() {
  const [plans, setPlans] = useState<Saved[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => { void api<{ plans: Saved[] }>("/api/me/plans").then((result) => {
    if (result.ok) setPlans(result.data.plans);
    else setMessage(result.message);
  }); }, []);
  const remove = async (id: string) => {
    setBusy(id);
    const result = await api<{ deleted: boolean }>(`/api/me/plans/${id}`, { method: "DELETE" });
    setBusy(null);
    if (result.ok) setPlans((current) => current?.filter((plan) => plan.id !== id) ?? []);
    else setMessage(result.message);
  };
  return <section aria-label="Saved plans" className="rounded-[var(--radius-card)] border border-line bg-surface p-5">
    <h2 className="font-semibold">Saved plans</h2>
    <p className="mt-1 text-xs text-ink-muted">Only plans you chose to save. Encrypted in your account, deleted after 30 days or when you remove them. Opening one does not start or share a journey.</p>
    {plans === null && !message ? <p role="status" className="mt-2 text-sm text-ink-muted">Loading saved plans…</p> : null}
    {plans?.length === 0 ? <p className="mt-2 text-sm text-ink-muted">No saved plans.</p> : null}
    {plans?.length ? <ul className="mt-3 space-y-3">{plans.map((plan) => {
      const intent = intentFromDraft(plan.draft);
      return <li key={plan.id} className="rounded-xl border border-line p-3">
        <p className="text-sm font-semibold">{intent ? `${intent.activity} · ${intent.origin.kind === "device" ? "From here" : intent.origin.query}${intent.loop ? " · loop" : ` → ${intent.destination?.query}`}` : "Travel plan"}</p>
        <p className="mt-1 text-xs text-ink-muted">Expires {new Date(plan.expiresAt).toLocaleDateString()}</p>
        <div className="mt-2 flex flex-wrap gap-3"><Link href="/plan" onClick={() => setPlanDraft({ ...plan.draft, touched: true })} className="inline-flex min-h-11 items-center text-sm font-semibold text-accent-strong">Open plan</Link><button type="button" disabled={busy === plan.id} onClick={() => void remove(plan.id)} className="min-h-11 text-sm font-semibold text-ink-muted disabled:opacity-50">Delete plan</button></div>
      </li>;
    })}</ul> : null}
    {message ? <p role="status" className="mt-2 text-sm text-warm">{message}</p> : null}
  </section>;
}
