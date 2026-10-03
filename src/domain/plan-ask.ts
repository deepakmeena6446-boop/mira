import type { MovementIntent } from "./plan-contract";
import { resolvedDestination, resolvedOrigin, type PlanDraft } from "./plan-state";
import { laterDaylight, type PlanOptionsResult } from "./plan-options";

export type PlanAskAnswer = { text: string; next: "edit_plan" | "review_options"; evidence: PlanOptionsResult | null };

/** A time in prose is a hint, never an absolute departure without a date and zone. */
export function explicitTimeHint(message: string): string | null {
  const word = /\b(?:midnight|noon|dawn|sunrise|sunset)\b/i.exec(message);
  if (word) return word[0].toLowerCase();
  const clock = /\b(?:at\s+)?(1[0-2]|0?[1-9])(?::([0-5]\d))?\s*(a\.?m\.?|p\.?m\.?)\b/i.exec(message);
  if (!clock) return null;
  return `${Number(clock[1])}:${clock[2] ?? "00"} ${clock[3].replaceAll(".", "").toUpperCase()}`;
}

/** Text supplied by the person is context to acknowledge, not a resolved place or source. */
export function askDetails(message: string): { origin: string; destination: string; loop: boolean; timeHint: string | null } {
  const loop = /\b(loop|round trip|back to (?:my |the )?start)\b/i.test(message);
  const fromTo = /\bfrom\s+(.{2,80}?)\s+to\s+(.{2,80}?)(?=\s+at\s+(?:\d|midnight|noon|dawn|sunrise|sunset)|[.,!?]|$)/i.exec(message);
  const start = !fromTo && loop ? /\bfrom\s+(.{2,80}?)(?=\s+at\s+(?:\d|midnight|noon|dawn|sunrise|sunset)|[.,!?]|$)/i.exec(message) : null;
  const origin = (fromTo?.[1] ?? start?.[1] ?? "").trim();
  return { origin: /^here$/i.test(origin) ? "" : origin, destination: (fromTo?.[2] ?? "").trim(), loop, timeHint: explicitTimeHint(message) };
}

/** Seed only explicit, low-ambiguity wording. Places remain unresolved and time/zone require entry. */
export function draftFromAsk(message: string, base: PlanDraft): PlanDraft {
  const text = message.trim();
  const details = askDetails(text);
  const mode = /\b(taxi|cab|ride)\b/i.test(text) ? "ride" : /\b(train|metro|bus|transit)\b/i.test(text) ? "transit" : "walk";
  return {
    ...base, touched: true, activity: text.slice(0, 160), loop: details.loop, mode, timeHint: details.timeHint,
    origin: { kind: "named", query: details.origin.slice(0, 160), resolution: null },
    destination: { query: details.destination.slice(0, 160), resolution: null },
    departureLocal: "", timeZone: "",
  };
}

/** Deterministic, source-bound plan answer. The user's prose is never echoed or treated as evidence. */
export function answerPlanQuestion(message: string, plan: MovementIntent | null, evidence: PlanOptionsResult | null): PlanAskAnswer {
  if (!plan) {
    const details = askDetails(message);
    if (details.origin) {
      const places = details.destination ? `${details.origin} → ${details.destination}` : details.origin;
      const time = details.timeHint ? ` You said ${details.timeHint}; I still need the date and local time zone before calculating daylight.` : " Choose the local departure date and time before checking daylight.";
      const next = details.loop
        ? "A mapped loop, running time, lighting and activity are not verified here. Choose the named starting place result in Plan, then compare the calculated daylight time or use a manual route."
        : details.destination
          ? "Choose both named place results in Plan to check mapped walking paths. Ride and transit service at that time remain unverified."
          : "Choose the named starting place result and a destination in Plan to check mapped walking paths.";
      return { text: `I have ${places} as the place${details.destination ? "s" : ""} you named; I have not resolved ${details.destination ? "them" : "it"} to a map location.${time} ${next}`, next: "edit_plan", evidence: null };
    }
    const arrival = /land|airport|station|flight|hotel|arriv/i.test(message);
    const outing = /date|event|concert|venue|return/i.test(message);
    const first = arrival
      ? "For a late arrival, I can keep the destination's local time and compare available mapped travel facts. I cannot assume a train, taxi or hotel desk is operating. Which airport or station are you arriving at?"
      : outing
        ? "I can plan the way there and a return separately, without making assumptions about the event or person. Which venue are you going to?"
        : "I can start from a named place without your device location and calculate daylight once you choose a time. Which starting place should I use?";
    const hint = explicitTimeHint(message);
    return { text: `${first}${hint ? ` You mentioned ${hint}; enter the date and local time zone for that place so I don't guess an instant.` : ""}`, next: "edit_plan", evidence: null };
  }
  const from = resolvedOrigin(plan);
  const to = resolvedDestination(plan);
  if (!from) return { text: "I have your planned time and purpose. To compare an actual mapped way, choose the starting place you mean. Your current position will not replace it.", next: "edit_plan", evidence: null };
  if (!plan.loop && !to) return { text: "I have your starting place and planned time. Choose the destination result you mean; then I can compare mapped walking paths and calculated daylight. I cannot verify future ride or transit service yet.", next: "edit_plan", evidence: null };
  if (!evidence) return { text: "I have your plan, but the route evidence could not be checked. Keep the named places and time; try the comparison again in Around. I cannot claim a route or service is available.", next: "review_options", evidence: null };
  const daylight = evidence.daylight.status === "known" ? `Calculated daylight at departure is ${evidence.daylight.value}; this excludes weather and shade.` : "Daylight at departure is uncertain from this calculation.";
  if (plan.loop) {
    const later = evidence.daylight.status === "known" && evidence.daylight.value === "dark" ? laterDaylight(plan.departure.local, plan.departure.timeZone, from) : null;
    const timeOption = later ? ` Calculated daylight begins by about ${later.local.replace("T", " ")} (${plan.departure.timeZone}), ${later.minutesLater} minutes later; this is an approximate solar calculation, not a lighting or route check.` : "";
    return { text: `${daylight}${timeOption} A mapped loop is not available, so I cannot compare loop routes, running time, lighting or activity. Choose a destination in your plan to compare a mapped walking path, change the departure time, or use a manual check-in after you start.`, next: "edit_plan", evidence };
  }
  if (evidence.state !== "ready") return { text: `${daylight} I cannot compare mapped walking paths: ${evidence.detail} Ride and transit service, lighting and opening hours at the planned time are unverified. You can edit the place or time and retry.`, next: "edit_plan", evidence };
  const fastest = evidence.options[0];
  const alternate = evidence.options.length > 1 ? ` A distinct mapped alternative takes about ${Math.round(evidence.options[1].minutes)} minutes.` : " No distinct mapped alternative met the graph rules.";
  const modeLimit = plan.mode === "walk" ? "This is a walking estimate, not a running pace or a safety comparison." : `You selected ${plan.mode}; this mapped walk is only a reference. ${plan.mode === "ride" ? "Driver, pickup and last-leg access" : "Service hours, stops and last-leg access"} are not verified for your planned time. Confirm with the operator or provider before relying on that mode.`;
  return { text: `${daylight} The shortest mapped walk is about ${Math.round(fastest.minutes)} minutes over ${(fastest.meters / 1000).toFixed(1)} km.${alternate} Source: ${fastest.evidence[0].status === "known" ? fastest.evidence[0].source.label : "unknown"}, snapshot ${evidence.sourceAt ?? "unknown"}, for ${evidence.scope}. ${modeLimit} Ride and transit service, lighting and opening hours at the planned time remain unverified. Review the options before choosing a journey; starting or sharing requires a separate confirmation.`, next: "review_options", evidence };
}
