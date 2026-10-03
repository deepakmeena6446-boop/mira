"use client";

import Link from "next/link";
import { hasPlanWork, intentFromDraft } from "@/domain/plan-state";
import { usePlanDraft } from "@/lib/plan-store";
import { useLocalJourneyActive } from "@/lib/local-check-in-store";

/** The tab-scoped plan is visible in Journeys without saving it to the account. */
export function JourneyPlanCard() {
  const draft = usePlanDraft();
  const privateCheckIn = useLocalJourneyActive();
  if (!hasPlanWork(draft) || !draft) return null;
  const plan = intentFromDraft(draft);
  return <section aria-label="Current travel plan" className="rounded-[var(--radius-card)] border border-line bg-surface p-5">
    <h2 className="font-semibold">Current plan in this tab</h2>
    <p className="mt-1 text-sm text-ink-muted">{plan ? `${plan.activity} · ${plan.origin.kind === "device" ? "From here" : plan.origin.query}${plan.loop ? " · loop" : ` → ${plan.destination?.query}`} · ${plan.departure.local} (${plan.departure.timeZone})` : `${draft.activity.trim() || "Movement"} · still being entered`}{draft.legs?.length ? ` · ${draft.legs.length} more travel leg${draft.legs.length === 1 ? "" : "s"}` : ""}</p>
    <p className="mt-1 text-xs text-ink-muted">Temporary for up to two hours after your last edit. {privateCheckIn ? "Your private manual journey is active in this tab; no contact was told." : "Planning does not start or share a journey; each action needs confirmation."}</p>
    <Link href="/plan" className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-accent-strong">Continue plan</Link>
    {privateCheckIn ? <Link href="/trip/local" className="ml-4 inline-flex min-h-11 items-center text-sm font-semibold text-accent-strong">Resume private journey</Link> : null}
  </section>;
}
