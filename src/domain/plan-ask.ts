import type { MovementIntent } from "./plan-contract";
import { resolvedDestination, resolvedOrigin, type PlanDraft } from "./plan-state";
import { deterministicIntentHints, applyIntentHints, type MovementIntentHints } from "./plan-intent";
import { laterDaylight, type PlanOptionsResult } from "./plan-options";

export type PlanAskAnswer = { text: string; next: "edit_plan" | "review_options"; evidence: PlanOptionsResult | null };

/** A time in prose is a hint, never an absolute departure without a date and zone. */
export function explicitTimeHint(message: string): string | null {
  return deterministicIntentHints(message).timeHint;
}

/** Text supplied by the person is context to acknowledge, not a resolved place or source. */
export function askDetails(message: string): { origin: string; destination: string; loop: boolean; timeHint: string | null } {
  const hints = deterministicIntentHints(message);
  return { origin: hints.origin, destination: hints.destination, loop: hints.loop, timeHint: hints.timeHint };
}

/** Seed only explicit, low-ambiguity wording. Places remain unresolved and time/zone require entry. */
export function draftFromAsk(message: string, base: PlanDraft, hints?: MovementIntentHints): PlanDraft {
  return applyIntentHints(message, base, hints ?? deterministicIntentHints(message));
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
  if (!evidence) return { text: "I have your plan, but the route evidence could not be checked. Keep the named places and time; try the comparison again in Plan. I cannot claim a route or service is available.", next: "review_options", evidence: null };
  const daylight = evidence.daylight.status === "known" ? `Calculated daylight at departure is ${evidence.daylight.value}; this excludes weather and shade.` : "Daylight at departure is uncertain from this calculation.";
  if (plan.loop && evidence.state === "ready" && evidence.options.length) {
    const first = evidence.options[0];
    const alternatives = evidence.options.slice(1).map((option) => `${option.label}: about ${Math.round(option.minutes)} minutes over ${(option.meters / 1000).toFixed(1)} km`).join("; ");
    const later = evidence.timeAlternatives?.[0];
    const timeOption = later ? ` A later departure with calculated daylight is ${later.local.replace("T", " ")} (${later.timeZone}); changing time does not verify lighting or activity.` : "";
    return { text: `${daylight} ${first.label}: about ${Math.round(first.minutes)} minutes over ${(first.meters / 1000).toFixed(1)} km.${alternatives ? ` Alternatives: ${alternatives}.` : " No distinct mapped alternative was found."} Time uses your chosen or stated assumed pace, not a measured running speed. Source: ${evidence.source ?? "unknown"}, snapshot ${evidence.sourceAt ?? "unknown"}, ${evidence.scope}. Access from the starting place to the graph, lighting, activity and live conditions are unverified.${timeOption} Review and choose an option; starting or sharing requires separate confirmation.`, next: "review_options", evidence };
  }
  if (plan.loop) {
    const later = evidence.daylight.status === "known" && evidence.daylight.value === "dark" ? laterDaylight(plan.departure.local, plan.departure.timeZone, from) : null;
    const timeOption = later ? ` Calculated daylight begins by about ${later.local.replace("T", " ")} (${plan.departure.timeZone}), ${later.minutesLater} minutes later. This is a solar calculation, not a lighting or route check.` : "";
    return { text: `${daylight}${timeOption} No eligible mapped loop was found: ${evidence.detail} Choose a different loop distance or starting place, change the departure time, or retain a manual plan. Lighting, activity and live conditions remain unverified.`, next: "edit_plan", evidence };
  }
  if (evidence.state !== "ready") return { text: `${daylight} I cannot compare mapped walking paths: ${evidence.detail} Ride and transit service, lighting and opening hours at the planned time are unverified. You can edit the place or time and retry.`, next: "edit_plan", evidence };
  const fastest = evidence.options[0];
  if (!fastest) return { text: `${daylight} No checked option was returned. Retry the route comparison; no route or service is confirmed.`, next: "edit_plan", evidence };
  const alternate = evidence.options.length > 1 ? ` A distinct mapped alternative takes about ${Math.round(evidence.options[1].minutes)} minutes.` : " No distinct mapped alternative met the graph rules.";
  const modeLimit = plan.mode === "walk" ? "This is a mapped pedestrian estimate at the stated assumed pace, not a safety comparison." : `You selected ${plan.mode}; this mapped walk is only a reference. ${plan.mode === "ride" ? "Driver, pickup and last-leg access" : "Service hours, stops and last-leg access"} are not verified for your planned time. Confirm with the operator or provider before relying on that mode.`;
  return { text: `${daylight} ${fastest.label} is about ${Math.round(fastest.minutes)} minutes over ${(fastest.meters / 1000).toFixed(1)} km.${alternate} Source: ${fastest.evidence[0].status === "known" ? fastest.evidence[0].source.label : "unknown"}, snapshot ${evidence.sourceAt ?? "unknown"}, for ${evidence.scope}. ${fastest.departureLocal ? ` Departure ${fastest.departureLocal} (${fastest.timeZone ?? plan.departure.timeZone})${fastest.arrivalLocal ? `; estimated arrival ${fastest.arrivalLocal}` : ""}.` : ""} ${modeLimit} Ride and transit service, lighting and opening hours at the planned time remain unverified. Review the options before choosing a journey; starting or sharing requires a separate confirmation.`, next: "review_options", evidence };
}
