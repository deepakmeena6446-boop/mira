import { z } from "zod";
import { loopTargetSchema, paceSchema, planTimeKindSchema } from "./plan-contract";
import type { PlanDraft } from "./plan-state";

/** Hints are user wording, not provider facts, resolved coordinates or permission to act. */
export const movementIntentHintsSchema = z.object({
  origin: z.string().trim().max(160), destination: z.string().trim().max(160),
  loop: z.boolean(), mode: z.enum(["walk", "ride", "transit"]),
  timeKind: planTimeKindSchema, timeHint: z.string().max(24).nullable(), returnTimeHint: z.string().max(24).nullable(),
  loopTarget: loopTargetSchema.optional(), paceMinutesPerKm: paceSchema.optional(),
}).strict();
export type MovementIntentHints = z.infer<typeof movementIntentHintsSchema>;

const TIME = /\b(?:midnight|noon|dawn|sunrise|sunset)|\b(?:1[0-2]|0?[1-9])(?::[0-5]\d)?\s*(?:a\.?m\.?|p\.?m\.?)\b|\b(?:[01]?\d|2[0-3]):[0-5]\d\b/gi;
function normalizeTime(value: string): string {
  const clock = /^(\d{1,2})(?::([0-5]\d))?\s*(a\.?m\.?|p\.?m\.?)$/i.exec(value);
  return clock ? `${Number(clock[1])}:${clock[2] ?? "00"} ${clock[3].replaceAll(".", "").toUpperCase()}` : value.toLowerCase();
}
function firstTimeHint(clause: string): string | null {
  const explicit = [...clause.matchAll(TIME)][0];
  // A bare clock number is useful wording, but its AM/PM remains unresolved.
  // Require a time clause and a boundary so a numbered address is not a clock.
  const bare = /\b(?:at|by|around|for|before|after)\s+((?:1[0-2]|0?[1-9]))(?=\s*(?:[.,!?]|$)|\s+(?:and|then|at|return|back)\b)/i.exec(clause);
  const bareIndex = bare ? bare.index + bare[0].lastIndexOf(bare[1]) : Infinity;
  return bare && (!explicit || bareIndex < (explicit.index ?? Infinity))
    ? `${Number(bare[1])} (AM/PM unspecified)`
    : explicit ? normalizeTime(explicit[0]) : null;
}
function isClockName(name: string): boolean {
  return /^(?:\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)?|midnight|noon|dawn|sunrise|sunset)$/i.test(name.trim());
}
export function timeHints(message: string): { timeHint: string | null; returnTimeHint: string | null; timeKind: "depart_at" | "arrive_by" } {
  const returnClause = /\b(?:return(?:ing)?|back|leave(?:\s+(?:the\s+)?(?:event|venue|dinner|hotel))?)\b(?:\s+(?:home|to\s+.{2,50}?))?\s+(?:at|by|around|after)?\s*(?=\d|midnight|noon|dawn|sunrise|sunset)/i.exec(message);
  const main = returnClause ? message.slice(0, returnClause.index) : message;
  const returned = returnClause ? message.slice(returnClause.index) : "";
  const first = firstTimeHint(main);
  const returnTime = firstTimeHint(returned);
  const arrival = /\b(?:arriv(?:e|ing|al)\s+(?:at|by)|(?:be|get|reach)\b.{0,50}\bby\b|arrive[- ]by|(?:dinner|event|concert|date|appointment|meeting)\b.{0,70}\b(?:at|by|for)\s*(?:\d|noon|midnight)|(?:dinner|event|concert|appointment|meeting)\s+(?:\d{1,2}(?::\d{2})?\s*(?:am|pm)))/i.test(main);
  return { timeHint: first ?? returnTime, returnTimeHint: first && returnTime ? returnTime : null, timeKind: arrival ? "arrive_by" : "depart_at" };
}
function cleanPlace(value: string | undefined): string {
  return (value ?? "").replace(/\s+(?:tomorrow|tonight|today)\s*$/i, "").trim().slice(0, 160);
}
/** Extract explicit clauses; uncertain names stay blank for user clarification. */
export function deterministicIntentHints(message: string): MovementIntentHints {
  const text = message.trim();
  const end = "(?=\\s+(?:at|by|for|around|before|after|then|and|but|return(?:ing)?|back)\\b|[.,!?]|$)";
  const fromTo = new RegExp(`\\bfrom\\s+(.{2,100}?)\\s+to\\s+(.{2,100}?)${end}`, "i").exec(text);
  const from = fromTo ?? new RegExp(`\\bfrom\\s+(.{2,100}?)${end}`, "i").exec(text);
  const to = !fromTo ? new RegExp(`\\b(?:go(?:ing)?|walk(?:ing)?|run(?:ning)?|get(?:ting)?|travel(?:ling)?|head(?:ing)?|commut(?:e|ing)|return(?:ing)?)\\s+(?:back\\s+)?to\\s+(.{2,100}?)(?=\\s+from\\b|\\s+(?:at|by|for|around|before|after|then|and|but|return(?:ing)?|back)\\b|[.,!?]|$)`, "i").exec(text) : null;
  const venue = !fromTo && !to && /\b(?:dinner|event|concert|date|appointment|meeting)\b/i.test(text)
    ? [...text.matchAll(/\bat\s+([^.,!?]{1,100}?)(?=\s+(?:from|at|by|for|around|then|and|return|back)\b|\s+\d|[.,!?]|$)/gi)].find((match) => !isClockName(match[1])) ?? null
    : null;
  let origin = cleanPlace(from?.[1]); if (/^(?:here|my (?:current )?location)$/i.test(origin)) origin = "";
  const destination = cleanPlace(fromTo?.[2] ?? to?.[1] ?? venue?.[1]);
  const running = /\b(?:run|running|jog|jogging)\b/i.test(text);
  const loop = /\b(?:loop|round trip|out[- ]and[- ]back|back to (?:my |the )?start(?:ing point)?)\b/i.test(text) || (running && !destination);
  const mode = running ? "walk" : /\b(?:taxi|cab|ride|car|driv(?:e|ing))\b/i.test(text) ? "ride" : /\b(?:train|metro|bus|transit|subway|tram|ferry)\b/i.test(text) ? "transit" : "walk";
  const duration = /\b(?:for\s+)?(\d{1,3})\s*(?:-?\s*(?:min(?:ute)?s?))\b/i.exec(text);
  const distance = /\b(\d+(?:\.\d+)?)\s*(km|kilomet(?:er|re)s?|m|met(?:er|re)s?)\b/i.exec(text);
  const pace = /\b(\d{1,2})(?::([0-5]\d)|(?:\.(\d{1,2})))?\s*(?:min(?:ute)?s?\s*)?(?:\/|per\s+)km\b/i.exec(text);
  const target = loop && distance ? { kind: "distance" as const, value: Number(distance[1]) * (/^(?:km|kilo)/i.test(distance[2]) ? 1000 : 1) } : loop && duration ? { kind: "duration" as const, value: Number(duration[1]) } : undefined;
  const loopTarget = target && loopTargetSchema.safeParse(target).success ? target : undefined;
  const paceValue = pace ? Number(pace[1]) + (pace[2] ? Number(pace[2]) / 60 : pace[3] ? Number(`0.${pace[3]}`) : 0) : undefined;
  const paceMinutesPerKm = paceValue !== undefined && paceSchema.safeParse(paceValue).success ? paceValue : undefined;
  return { origin, destination, loop, mode, ...timeHints(text), ...(loopTarget ? { loopTarget } : {}), ...(paceMinutesPerKm !== undefined ? { paceMinutesPerKm } : {}) };
}
/** Model extraction can recover literal names; chronology, modes and numeric hints remain deterministic. */
export function validatedModelHints(raw: unknown, message: string): MovementIntentHints | null {
  const parsed = movementIntentHintsSchema.safeParse(raw); if (!parsed.success) return null;
  const literal = (name: string) => !name || (!isClockName(name) && !/[-+]?\d{1,3}[.,]\d{3,}/.test(name) && message.toLocaleLowerCase().includes(name.toLocaleLowerCase()));
  if (!literal(parsed.data.origin) || !literal(parsed.data.destination) || /^here$/i.test(parsed.data.origin)) return null;
  const fallback = deterministicIntentHints(message);
  return { ...fallback, origin: fallback.origin || parsed.data.origin, destination: fallback.destination || parsed.data.destination, loop: fallback.loop && !(fallback.destination || parsed.data.destination) || /\b(?:loop|round trip|out[- ]and[- ]back)\b/i.test(message) };
}
export function applyIntentHints(message: string, base: PlanDraft, hints: MovementIntentHints): PlanDraft {
  const valid = movementIntentHintsSchema.parse(hints);
  return { ...base, selection: undefined, recipientIds: [], journeyMode: "manual", touched: true, activity: message.trim().slice(0, 160), origin: { kind: "named", query: valid.origin, resolution: null }, destination: { query: valid.destination, resolution: null }, loop: valid.loop, mode: valid.mode, timeHint: valid.timeHint, returnTimeHint: valid.returnTimeHint, timeKind: valid.timeKind, loopTarget: valid.loopTarget, paceMinutesPerKm: valid.paceMinutesPerKm, departureLocal: "", timeZone: "", destinationCountryIso: null, legs: [] };
}
