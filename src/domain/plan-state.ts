import { z } from "zod";
import { movementIntentSchema, PLAN_CONTRACT_VERSION, type MovementIntent } from "./plan-contract";
import { TRAVEL_MODES } from "./travel-mode";

const point = z.object({ lat: z.number().min(-90).max(90), lon: z.number().min(-180).max(180) }).strict();
export const planPlaceResolutionSchema = z.object({ source: z.enum(["search", "saved_place", "selected_point"]), point, placeId: z.string().min(1).optional(), name: z.string().min(1) }).strict();
export type PlanPlaceResolution = z.infer<typeof planPlaceResolutionSchema>;
const namedPlace = z.object({ query: z.string().max(160), resolution: planPlaceResolutionSchema.nullable() }).strict();
export const planLegDraftSchema = z.object({
  label: z.string().max(160),
  origin: namedPlace,
  destination: namedPlace,
  departureLocal: z.string().max(16),
  timeZone: z.string().max(64),
  mode: z.enum(TRAVEL_MODES),
  destinationCountryIso: z.string().regex(/^[A-Z]{2}$/).nullable(),
}).strict();
export type PlanLegDraft = z.infer<typeof planLegDraftSchema>;

/** Partial entry is useful before both places resolve. It never authorizes a journey start. */
export const planDraftSchema = z.object({
  version: z.literal(PLAN_CONTRACT_VERSION),
  touched: z.boolean(),
  activity: z.string().max(160),
  origin: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("named"), query: z.string().max(160), resolution: planPlaceResolutionSchema.nullable() }).strict(),
    z.object({ kind: z.literal("device"), use: z.literal("from_here"), point }).strict(),
  ]),
  destination: namedPlace,
  loop: z.boolean(),
  departureLocal: z.string().max(16),
  timeZone: z.string().max(64),
  mode: z.enum(TRAVEL_MODES),
  constraints: z.string().max(500),
  destinationCountryIso: z.string().regex(/^[A-Z]{2}$/).nullable().optional(),
  legs: z.array(planLegDraftSchema).max(2).optional(),
}).strict();
export type PlanDraft = z.infer<typeof planDraftSchema>;

export function hasPlanWork(draft: PlanDraft | null): boolean {
  return Boolean(draft && (draft.touched || draft.activity.trim() || draft.origin.kind === "device" || draft.origin.query.trim() || draft.destination.query.trim() || draft.loop || draft.constraints.trim() || draft.legs?.length));
}

export function newPlanDraft(now: Date, timeZone: string): PlanDraft {
  const local = new Intl.DateTimeFormat("sv-SE", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(now).replace(" ", "T");
  return { version: PLAN_CONTRACT_VERSION, touched: false, activity: "", origin: { kind: "named", query: "", resolution: null }, destination: { query: "", resolution: null }, loop: false, departureLocal: local, timeZone, mode: "walk", constraints: "", destinationCountryIso: null, legs: [] };
}

export function newPlanLeg(): PlanLegDraft {
  return { label: "", origin: { query: "", resolution: null }, destination: { query: "", resolution: null }, departureLocal: "", timeZone: "", mode: "walk", destinationCountryIso: null };
}

export function intentFromLeg(leg: PlanLegDraft): MovementIntent | null {
  const named = (place: PlanLegDraft["origin"]) => ({ kind: "named" as const, query: place.query.trim(), ...(place.resolution ? { resolution: { source: place.resolution.source, point: place.resolution.point, ...(place.resolution.placeId ? { placeId: place.resolution.placeId } : {}) } } : {}) });
  const parsed = movementIntentSchema.safeParse({ version: PLAN_CONTRACT_VERSION, activity: leg.label.trim(), origin: named(leg.origin), destination: named(leg.destination), loop: false, departure: { local: leg.departureLocal, timeZone: leg.timeZone }, mode: leg.mode, constraints: [] });
  return parsed.success ? parsed.data : null;
}

export function intentFromDraft(draft: PlanDraft): MovementIntent | null {
  const origin = draft.origin.kind === "device" ? draft.origin : {
    kind: "named" as const,
    query: draft.origin.query.trim(),
    ...(draft.origin.resolution ? { resolution: { source: draft.origin.resolution.source, point: draft.origin.resolution.point, ...(draft.origin.resolution.placeId ? { placeId: draft.origin.resolution.placeId } : {}) } } : {}),
  };
  const destination = draft.loop ? null : { kind: "named" as const, query: draft.destination.query.trim(), ...(draft.destination.resolution ? { resolution: { source: draft.destination.resolution.source, point: draft.destination.resolution.point, ...(draft.destination.resolution.placeId ? { placeId: draft.destination.resolution.placeId } : {}) } } : {}) };
  const parsed = movementIntentSchema.safeParse({
    version: PLAN_CONTRACT_VERSION,
    activity: draft.activity.trim(), origin, destination, loop: draft.loop,
    departure: { local: draft.departureLocal, timeZone: draft.timeZone }, mode: draft.mode,
    constraints: draft.constraints.split(",").map((part) => part.trim()).filter(Boolean),
  });
  return parsed.success ? parsed.data : null;
}

/** Promote one complete named leg for comparison without discarding the previous main leg. */
export function activatePlanLeg(draft: PlanDraft, index: number): PlanDraft | null {
  const leg = draft.legs?.[index];
  if (!leg) return null;
  const selected = intentFromLeg(leg);
  const main = intentFromDraft(draft);
  if (!selected || !main || main.loop || draft.origin.kind !== "named" || !resolvedOrigin(main) || !resolvedDestination(main)) return null;
  if (!resolvedOrigin(selected) || !resolvedDestination(selected)) return null;
  const previous: PlanLegDraft = {
    label: draft.activity,
    origin: { query: draft.origin.query, resolution: draft.origin.resolution },
    destination: draft.destination,
    departureLocal: draft.departureLocal,
    timeZone: draft.timeZone,
    mode: draft.mode,
    destinationCountryIso: draft.destinationCountryIso ?? null,
  };
  const legs = [...(draft.legs ?? [])];
  legs[index] = previous;
  return { ...draft, touched: true, activity: leg.label, origin: { kind: "named", ...leg.origin }, destination: leg.destination, departureLocal: leg.departureLocal, timeZone: leg.timeZone, mode: leg.mode, destinationCountryIso: leg.destinationCountryIso, legs };
}

export function resolvedOrigin(intent: MovementIntent): { lat: number; lon: number } | null {
  return intent.origin.kind === "device" ? intent.origin.point : intent.origin.resolution?.point ?? null;
}

export function resolvedDestination(intent: MovementIntent): { name: string; lat: number; lon: number } | null {
  if (!intent.destination?.resolution) return null;
  return { name: intent.destination.query, ...intent.destination.resolution.point };
}

/** A session lasts at most two hours without edits; it is not account history. */
export const PLAN_SESSION_TTL_MS = 2 * 60 * 60_000;
export function parsePlanSession(raw: string | null, now: number): PlanDraft | null {
  if (!raw) return null;
  try {
    const parsed = z.object({ savedAt: z.number().int(), draft: planDraftSchema }).strict().safeParse(JSON.parse(raw));
    if (!parsed.success || parsed.data.savedAt > now || now - parsed.data.savedAt >= PLAN_SESSION_TTL_MS) return null;
    return parsed.data.draft;
  } catch { return null; }
}
export function serializePlanSession(draft: PlanDraft, now: number): string {
  const valid = planDraftSchema.parse(draft);
  // Google Places content (name/coordinates) is display-only. Keep a user's typed
  // query, but ask them to resolve a Google result again after a page reload.
  const origin = valid.origin.kind === "named" && valid.origin.resolution?.placeId?.startsWith("g:")
    ? { ...valid.origin, resolution: null } : valid.origin;
  const destination = valid.destination.resolution?.placeId?.startsWith("g:")
    ? { ...valid.destination, resolution: null } : valid.destination;
  const scrub = (place: PlanLegDraft["origin"]) => place.resolution?.placeId?.startsWith("g:") ? { ...place, resolution: null } : place;
  const legs = valid.legs?.map((leg) => ({ ...leg, origin: scrub(leg.origin), destination: scrub(leg.destination) }));
  return JSON.stringify({ savedAt: now, draft: { ...valid, origin, destination, ...(legs ? { legs } : {}) } });
}
