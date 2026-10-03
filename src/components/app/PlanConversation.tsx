"use client";
import { useState } from "react";
import type { MovementIntent } from "@/domain/plan-contract";
import { immediateSupportIntent } from "@/domain/ask-routing";
import { Icon } from "@/components/ui/Icon";
import { usePlanDraft } from "@/lib/plan-store";
import { intentFromLeg } from "@/domain/plan-state";
import { planSelectionContext } from "@/domain/plan-options";

/** A bounded, ephemeral conversation in the current plan. No account chat history is loaded. */
export function PlanConversation({ plan }: { plan: MovementIntent }) {
  const draft = usePlanDraft();
  const [input, setInput] = useState(""); const [answer, setAnswer] = useState(""); const [busy, setBusy] = useState(false);
  const send = async () => {
    const message = input.trim(); if (!message || busy) return;
    if (immediateSupportIntent(message)) { window.dispatchEvent(new Event("mira:need-options")); return; }
    setBusy(true); setAnswer("");
    try { const r = await fetch("/api/mira/plan", { method: "POST", headers: { "content-type": "application/json", "x-mira-request": "1" }, body: JSON.stringify({ message, plan, selectedOptionId: draft?.selection?.context === planSelectionContext(plan) ? draft.selection.optionId : undefined, legs: (draft?.legs ?? []).map(intentFromLeg), countryIsos: [draft?.destinationCountryIso ?? null, ...(draft?.legs ?? []).map((leg) => leg.destinationCountryIso)] }) }); if (!r.ok || !r.body) throw new Error("unavailable"); const reader = r.body.getReader(); const decoder = new TextDecoder(); let buffer = ""; let spoken = ""; for (;;) { const next = await reader.read(); if (next.done) break; buffer += decoder.decode(next.value, { stream: true }); const lines = buffer.split("\n"); buffer = lines.pop() ?? ""; for (const line of lines) { if (!line.trim()) continue; const event = JSON.parse(line); if (event.type === "text") { spoken += event.delta ?? ""; setAnswer(spoken); } } } setInput(""); }
    catch { setAnswer("I couldn’t check that just now. Your plan and existing options are still here; retry when connected. Support and Emergency remain available."); }
    finally { setBusy(false); }
  };
  return <section className="rounded-3xl border border-line bg-surface p-5" aria-label="Ask about this plan"><details><summary className="flex min-h-12 cursor-pointer items-center gap-2 font-semibold"><Icon name="sparkle" />Ask Mira about this plan</summary><p className="my-3 text-xs text-ink-muted">Movement questions use the checked plan evidence and are not saved to account chat history. Answers cannot start or share your journey.</p>{answer ? <p role="status" className="mb-4 whitespace-pre-line text-sm leading-relaxed">{answer}</p> : null}<form onSubmit={(e) => { e.preventDefault(); void send(); }}><label htmlFor="plan-question" className="sr-only">Question about your plan</label><textarea id="plan-question" value={input} onChange={(e) => setInput(e.target.value)} maxLength={1000} rows={2} placeholder="What should I know about the return?" className="w-full rounded-xl border border-line-strong bg-canvas p-3" /><button type="submit" disabled={busy || !input.trim()} className="mira-primary mt-3">{busy ? "Checking…" : "Ask Mira"}</button></form></details></section>;
}
