import type { MovementIntent } from "./plan-contract";
import { resolvedDestination, resolvedOrigin, type PlanDraft } from "./plan-state";
import type { PlanOptionsResult } from "./plan-options";

export type PlanAskAnswer = { text: string; next: "edit_plan" | "review_options"; evidence: PlanOptionsResult | null };

/** Seed only explicit, low-ambiguity wording. Places remain unresolved and time/zone require entry. */
export function draftFromAsk(message: string, base: PlanDraft): PlanDraft {
  const text = message.trim();
  const loop = /\b(loop|round trip|back to (?:my |the )?start)\b/i.test(text);
  const mode = /\b(taxi|cab|ride)\b/i.test(text) ? "ride" : /\b(train|metro|bus|transit)\b/i.test(text) ? "transit" : "walk";
  const fromTo = /\bfrom\s+(.{2,80}?)\s+to\s+(.{2,80}?)(?=\s+at\s+(?:\d|midnight|noon|dawn|sunrise|sunset)|[.,!?]|$)/i.exec(text);
  const start = !fromTo && loop ? /\bfrom\s+(.{2,80}?)(?=\s+at\s+(?:\d|midnight|noon|dawn|sunrise|sunset)|[.,!?]|$)/i.exec(text) : null;
  const originQuery = (fromTo?.[1] ?? start?.[1] ?? "").trim();
  const destinationQuery = (fromTo?.[2] ?? "").trim();
  return {
    ...base, touched: true, activity: text.slice(0, 160), loop, mode,
    origin: { kind: "named", query: /^here$/i.test(originQuery) ? "" : originQuery.slice(0, 160), resolution: null },
    destination: { query: destinationQuery.slice(0, 160), resolution: null },
    departureLocal: "", timeZone: "",
  };
}

/** Deterministic, source-bound plan answer. The user's prose is never echoed or treated as evidence. */
export function answerPlanQuestion(message: string, plan: MovementIntent | null, evidence: PlanOptionsResult | null): PlanAskAnswer {
  if (!plan) {
    const arrival = /land|airport|station|flight|hotel|arriv/i.test(message);
    const outing = /date|event|concert|venue|return/i.test(message);
    const first = arrival
      ? "For a late arrival, I can keep the destination's local time and compare available mapped travel facts. I cannot assume a train, taxi or hotel desk is operating. Which airport or station are you arriving at?"
      : outing
        ? "I can plan the way there and a return separately, without making assumptions about the event or person. Which venue are you going to?"
        : "I can start from a named place without your device location and calculate daylight once you choose a time. Which starting place should I use?";
    return { text: first, next: "edit_plan", evidence: null };
  }
  const from = resolvedOrigin(plan);
  const to = resolvedDestination(plan);
  if (!from) return { text: "I have your planned time and purpose. To compare an actual mapped way, choose the starting place you mean. Your current position will not replace it.", next: "edit_plan", evidence: null };
  if (!plan.loop && !to) return { text: "I have your starting place and planned time. Choose the destination result you mean; then I can compare mapped walking paths and calculated daylight. I cannot verify future ride or transit service yet.", next: "edit_plan", evidence: null };
  if (!evidence) return { text: "I have your plan, but the route evidence could not be checked. Keep the named places and time; try the comparison again in Around. I cannot claim a route or service is available.", next: "review_options", evidence: null };
  const daylight = evidence.daylight.status === "known" ? `Calculated daylight at departure is ${evidence.daylight.value}; this excludes weather and shade.` : "Daylight at departure is uncertain from this calculation.";
  if (plan.loop) return { text: `${daylight} A mapped loop is not available, so I cannot compare loop routes or lighting. Choose a destination in your plan to compare a real walking path, or choose a different departure time.`, next: "edit_plan", evidence };
  if (evidence.state !== "ready") return { text: `${daylight} I cannot compare mapped walking paths: ${evidence.detail} Ride and transit service, lighting and opening hours at the planned time are unverified. You can edit the place or time and retry.`, next: "edit_plan", evidence };
  const fastest = evidence.options[0];
  const alternate = evidence.options.length > 1 ? ` A distinct mapped alternative takes about ${Math.round(evidence.options[1].minutes)} minutes.` : " No distinct mapped alternative met the graph rules.";
  return { text: `${daylight} The shortest mapped walk is about ${Math.round(fastest.minutes)} minutes over ${(fastest.meters / 1000).toFixed(1)} km.${alternate} Source: ${fastest.evidence[0].status === "known" ? fastest.evidence[0].source.label : "unknown"}, snapshot ${evidence.sourceAt ?? "unknown"}, for ${evidence.scope}. This compares mapped time and distance only. Ride and transit service, lighting and opening hours at the planned time remain unverified. Review the options before choosing a journey; starting or sharing requires a separate confirmation.`, next: "review_options", evidence };
}
