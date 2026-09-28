"use client";

import { recordUsage } from "@/lib/usage-signal";
import { useState } from "react";
import { api } from "@/lib/api-client";
import { useCountry } from "@/lib/locale-store";
import type { CheckView } from "@/server/contributions/checks";

export type ContributionOutcome = "pending" | "verified" | "contradicted" | "duplicate" | null;

/** What happened to her answer, in plain words. Never a reward, never a number that isn't real. */
export function outcomeMessage(outcome: ContributionOutcome, recorded = true): string {
  if (!recorded && outcome !== "duplicate") return "No problem. Thanks for looking.";
  switch (outcome) {
    case "verified":
      return "Thank you. That matches what someone else (or the listed hours) said, so it now helps the next person.";
    case "contradicted":
      return "Thank you. Others said something different, so Mira won't show either answer for now.";
    case "duplicate":
      return "You've already told Mira about this recently. Thank you.";
    default:
      return "Thank you. It's waiting for someone else to confirm before Mira uses it.";
  }
}

/**
 * One Mira Check: a small, objective question about a place she passed on a walk. Always
 * skippable. Rendered on the Contribute tab and (wired by the journey screen) after arrival.
 */
export function CheckCard({ check, onDone }: { check: Pick<CheckView, "id" | "question" | "options">; onDone?: (outcome: ContributionOutcome) => void }) {
  const country = useCountry();
  const [state, setState] = useState<"ask" | "sending" | "failed">("ask");
  const [done, setDone] = useState<string | null>(null);
  const send = async (answer: string) => {
    setState("sending");
    const r = await api<{ recorded: boolean; outcome: ContributionOutcome }>(`/api/contribute/check/${check.id}`, { body: { answer, country: country.iso } });
    if (r.ok) {
      if (answer !== "skip" && r.data.recorded) recordUsage("check");
      setDone(outcomeMessage(r.data.outcome, r.data.recorded));
      onDone?.(r.data.outcome);
    } else if (r.status === 404 || r.status === 409) {
      setDone(r.message);
      onDone?.(null);
    } else setState("failed");
  };
  if (done) {
    return (
      <p role="status" className="rounded-[var(--radius-card)] bg-surface px-5 py-4 text-sm text-ink-muted shadow-[var(--shadow-card)] animate-rise">
        {done}
      </p>
    );
  }
  return (
    <div className="rounded-[var(--radius-card)] bg-surface p-5 text-left shadow-[var(--shadow-card)] animate-rise">
      <p className="font-semibold">{check.question}</p>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {check.options.map((o) => (
          <button key={o.value} type="button" disabled={state === "sending"} onClick={() => send(o.value)} className="min-h-12 rounded-[var(--radius-button)] border border-line-strong bg-surface px-2 text-sm font-semibold hover:bg-sunken disabled:opacity-60">
            {o.label}
          </button>
        ))}
      </div>
      <div className="mt-2 flex items-start justify-between gap-3">
        <p className="text-xs text-ink-subtle">
          {state === "failed" ? "Couldn't send that. Check your connection and try again." : "About the place, not about you. Your answer is stored without your name."}
        </p>
        <button type="button" disabled={state === "sending"} onClick={() => send("skip")} className="min-h-11 shrink-0 rounded-full px-3 text-xs font-semibold text-ink-muted hover:bg-sunken">
          Skip
        </button>
      </div>
    </div>
  );
}
