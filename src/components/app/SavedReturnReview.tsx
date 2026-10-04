"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { activatePlanLeg, planDraftSchema, type PlanDraft } from "@/domain/plan-state";
import { instantForLocal } from "@/domain/plan-options";
import { api } from "@/lib/api-client";
import { setPlanDraft } from "@/lib/plan-store";
import { SignInSheet } from "./SignInSheet";

type Saved = { id: string; draft: PlanDraft; expiresAt: string };
type Candidate = { id: string; index: number; event: string; plan: PlanDraft };

function candidates(plans: Saved[]): Candidate[] {
  return plans.flatMap((saved) => {
    const draft = planDraftSchema.safeParse(saved.draft);
    const expiry = Date.parse(saved.expiresAt);
    if (!draft.success || !Number.isFinite(expiry) || expiry <= Date.now()) return [];
    return (draft.data.legs ?? []).flatMap((leg, index) => {
      const reversePlaces = draft.data.origin.kind === "named" && leg.origin.query.trim().toLowerCase() === draft.data.destination.query.trim().toLowerCase() && leg.destination.query.trim().toLowerCase() === draft.data.origin.query.trim().toLowerCase();
      if ((!/^return\b/i.test(leg.label) && !reversePlaces) || !instantForLocal(leg.departureLocal, leg.timeZone)) return [];
      const plan = activatePlanLeg(draft.data, index);
      return plan ? [{ id: saved.id, index, event: draft.data.activity, plan }] : [];
    });
  });
}

/** Only an explicit restore reads account plans; expired tab drafts are never retained. */
export function SavedReturnReview() {
  const router = useRouter();
  const [choices, setChoices] = useState<Candidate[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [needsSignIn, setNeedsSignIn] = useState(false);
  const [signInOpen, setSignInOpen] = useState(false);
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);

  const load = async (selected?: Candidate) => {
    if (busy) return;
    request.current?.abort();
    const controller = new AbortController(); request.current = controller;
    setBusy(true); setMessage(null); setNeedsSignIn(false);
    try {
      // Recheck on selection too: a listed plan may have been deleted or expired.
      const result = await api<{ plans: Saved[] }>("/api/me/plans", { signal: controller.signal });
      if (controller.signal.aborted) return;
      if (!result.ok) {
        setChoices(null);
        setNeedsSignIn(result.status === 401);
        setMessage(result.status === 401 ? "Sign in to access plans you explicitly saved. No temporary plan was saved for you." : result.network ? "Saved return plans are unavailable offline. Retry when connected; your journey has not changed." : "Couldn’t check saved return plans. Retry; your journey has not changed.");
        return;
      }
      const next = candidates(result.data.plans);
      setChoices(next);
      if (!selected) return;
      const fresh = next.find((choice) => choice.id === selected.id && choice.index === selected.index);
      if (!fresh) return setMessage("That saved return is no longer available. It may have been deleted or expired. Choose another plan.");
      setPlanDraft(fresh.plan);
      // A saved return is started as a private manual journey, which the detailed planner confirms.
      router.push("/plan?planStep=options");
    } catch (error) {
      if (!controller.signal.aborted && !(error instanceof DOMException && error.name === "AbortError")) { setChoices(null); setMessage("Couldn’t check saved return plans. Retry; your journey has not changed."); }
    } finally { if (!controller.signal.aborted) setBusy(false); }
  };

  return <section aria-label="Saved return plans" className="mt-4 space-y-3 rounded-2xl border border-line bg-surface p-4 text-left">
    <p className="text-sm text-ink-muted">Temporary plans expire two hours after the last edit. You can restore a return from a plan you explicitly saved in your account for 30 days.</p>
    <button type="button" className="min-h-12 font-semibold text-accent-strong" disabled={busy} onClick={() => void load()}>{busy ? "Checking saved returns…" : choices !== null || message ? "Retry saved return plans" : "Choose a saved return plan"}</button>
    {busy || choices !== null || message ? <button type="button" className="ml-3 min-h-12 text-sm font-semibold text-ink-muted" onClick={() => { request.current?.abort(); setChoices(null); setMessage(null); setNeedsSignIn(false); setSignInOpen(false); setBusy(false); }}>Close saved returns</button> : null}
    {choices?.length === 0 ? <p role="status" className="text-sm text-ink-muted">No available saved return plans. Deleted, expired or incomplete returns cannot be restored. You can enter a new plan.</p> : null}
    {choices?.length ? <ul className="space-y-3">{choices.map((choice) => <li key={`${choice.id}:${choice.index}`} className="rounded-xl border border-line p-3">
      <p className="text-sm font-semibold">{choice.event} · {choice.plan.activity}</p>
      <p className="mt-1 text-sm">{choice.plan.origin.kind === "named" ? choice.plan.origin.query : "Origin"} → {choice.plan.destination.query}</p>
      <p className="mt-1 text-xs text-ink-muted">{choice.plan.departureLocal.replace("T", " ")} ({choice.plan.timeZone})</p>
      <button type="button" disabled={busy} className="mt-2 min-h-12 font-semibold text-accent-strong" onClick={() => void load(choice)}>Review saved return: {choice.plan.activity}</button>
    </li>)}</ul> : null}
    {message ? <p role="status" className="text-sm text-warm">{message}</p> : null}
    {needsSignIn ? <button type="button" className="min-h-12 font-semibold text-accent-strong" onClick={() => setSignInOpen(true)}>Sign in for saved return plans</button> : null}
    <p className="text-xs text-ink-muted">Restoring opens a fresh options check. It does not start a journey, request location or share with contacts. Starting requires a separate confirmation.</p>
    <SignInSheet open={signInOpen} onClose={() => setSignInOpen(false)} reason="Sign in to review a saved return plan" />
  </section>;
}
