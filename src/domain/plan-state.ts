import { z } from "zod";
import { movementIntentSchema, PLAN_CONTRACT_VERSION, planVersionSchema, planTimeKindSchema, loopTargetSchema, paceSchema, type MovementIntent } from "./plan-contract";
import { TRAVEL_MODES } from "./travel-mode";

const point = z.object({ lat: z.number().min(-90).max(90), lon: z.number().min(-180).max(180) }).strict();
export const planPlaceResolutionSchema = z.object({ source: z.enum(["search", "saved_place", "selected_point"]), point, placeId: z.string().min(1).optional(), name: z.string().min(1) }).strict();
export type PlanPlaceResolution = z.infer<typeof planPlaceResolutionSchema>;
const namedPlace = z.object({ query: z.string().max(160), resolution: planPlaceResolutionSchema.nullable() }).strict();
export const planLegDraftSchema = z.object({
  label: z.string().max(160),
  timeHint: z.string().max(24).nullable().optional(),
  returnTimeHint: z.string().max(24).nullable().optional(),
  origin: namedPlace,
  destination: namedPlace,
  departureLocal: z.string().max(16),
  timeZone: z.string().max(64),
  mode: z.enum(TRAVEL_MODES),
  destinationCountryIso: z.string().regex(/^[A-Z]{2}$/).nullable(),
  timeKind: planTimeKindSchema.optional(),
  constraints: z.string().max(500).optional(),
  paceMinutesPerKm: paceSchema.optional(),
}).strict();
export type PlanLegDraft = z.infer<typeof planLegDraftSchema>;

/** Partial entry is useful before both places resolve. It never authorizes a journey start. */
export const planDraftSchema = z.object({
  version: planVersionSchema,
  touched: z.boolean(),
  activity: z.string().max(160),
  timeHint: z.string().max(24).nullable().optional(),
  returnTimeHint: z.string().max(24).nullable().optional(),
  selection: z.object({ optionId: z.string().max(160), context: z.string().max(16) }).strict().optional(),
  journeyMode: z.enum(["manual", "location"]).optional(),
  recipientIds: z.array(z.uuid()).max(20).optional(),
  origin: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("named"), query: z.string().max(160), resolution: planPlaceResolutionSchema.nullable() }).strict(),
    z.object({ kind: z.literal("device"), use: z.literal("from_here"), point }).strict(),
  ]),
  destination: namedPlace,
  loop: z.boolean(),
  departureLocal: z.string().max(16),
  timeZone: z.string().max(64),
  /** The zone came from the place, not from her: a new place may replace it (re-audit RA5). */
  timeZoneAuto: z.boolean().optional(),
  mode: z.enum(TRAVEL_MODES),
  constraints: z.string().max(500),
  timeKind: planTimeKindSchema.optional(),
  loopTarget: loopTargetSchema.optional(),
  paceMinutesPerKm: paceSchema.optional(),
  destinationCountryIso: z.string().regex(/^[A-Z]{2}$/).nullable().optional(),
  legs: z.array(planLegDraftSchema).max(2).optional(),
  /** The saved copy this tab plan was opened from, so saving again updates it instead of duplicating. */
  savedId: z.uuid().optional(),
}).strict();
export type PlanDraft = z.infer<typeof planDraftSchema>;

export function hasPlanWork(draft: PlanDraft | null): boolean {
  return Boolean(draft && (draft.touched || draft.activity.trim() || draft.origin.kind === "device" || draft.origin.query.trim() || draft.destination.query.trim() || draft.loop || draft.constraints.trim() || draft.legs?.length));
}

export function newPlanDraft(now: Date, timeZone: string): PlanDraft {
  const local = new Intl.DateTimeFormat("sv-SE", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(now).replace(" ", "T");
  return { version: PLAN_CONTRACT_VERSION, touched: false, activity: "", origin: { kind: "named", query: "", resolution: null }, destination: { query: "", resolution: null }, loop: false, departureLocal: local, timeZone, mode: "walk", constraints: "", timeKind: "depart_at", destinationCountryIso: null, legs: [] };
}

export function newPlanLeg(): PlanLegDraft {
  return { label: "", origin: { query: "", resolution: null }, destination: { query: "", resolution: null }, departureLocal: "", timeZone: "", mode: "walk", timeKind: "depart_at", constraints: "", destinationCountryIso: null };
}

/** Prefill the reverse places only; the return's time, zone and service need fresh checks. */
export function returnLegFromMain(draft: PlanDraft): PlanLegDraft | null {
  const main = intentFromDraft(draft);
  if (!main || main.loop || draft.origin.kind !== "named" || !resolvedOrigin(main) || !resolvedDestination(main)) return null;
  return { label: `Return to ${draft.origin.query}`.slice(0, 160), timeHint: draft.returnTimeHint ?? null, origin: { ...draft.destination }, destination: { query: draft.origin.query, resolution: draft.origin.resolution }, departureLocal: "", timeZone: draft.timeZone, mode: draft.mode, timeKind: "depart_at", constraints: draft.constraints, paceMinutesPerKm: draft.paceMinutesPerKm, destinationCountryIso: null };
}

export function intentFromLeg(leg: PlanLegDraft): MovementIntent | null {
  const named = (place: PlanLegDraft["origin"]) => ({ kind: "named" as const, query: place.query.trim(), ...(place.resolution ? { resolution: { source: place.resolution.source, point: place.resolution.point, ...(place.resolution.placeId ? { placeId: place.resolution.placeId } : {}) } } : {}) });
  const parsed = movementIntentSchema.safeParse({ version: PLAN_CONTRACT_VERSION, activity: leg.label.trim(), origin: named(leg.origin), destination: named(leg.destination), loop: false, departure: { local: leg.departureLocal, timeZone: leg.timeZone }, mode: leg.mode, timeKind: leg.timeKind ?? "depart_at", paceMinutesPerKm: leg.paceMinutesPerKm, constraints: (leg.constraints ?? "").split(",").map((part) => part.trim()).filter(Boolean) });
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
    timeKind: draft.timeKind ?? "depart_at", loopTarget: draft.loopTarget, paceMinutesPerKm: draft.paceMinutesPerKm,
  });
  return parsed.success ? parsed.data : null;
}

/** Promote one complete named leg for comparison without discarding the previous main leg. */
export function activatePlanLeg(draft: PlanDraft, index: number): PlanDraft | null {
  const leg = draft.legs?.[index];
  if (!leg) return null;
  const selected = intentFromLeg(leg);
  // Other named legs can still be partial. Reviewing a complete leg preserves them,
  // while the explicit account-save contract continues to require every leg complete.
  if (!selected || draft.loop || draft.origin.kind !== "named") return null;
  if (!resolvedOrigin(selected) || !resolvedDestination(selected)) return null;
  const previous: PlanLegDraft = {
    label: draft.activity,
    timeHint: draft.timeHint, returnTimeHint: draft.returnTimeHint,
    origin: { query: draft.origin.query, resolution: draft.origin.resolution },
    destination: draft.destination,
    departureLocal: draft.departureLocal,
    timeZone: draft.timeZone,
    mode: draft.mode,
    timeKind: draft.timeKind ?? "depart_at", constraints: draft.constraints, paceMinutesPerKm: draft.paceMinutesPerKm,
    destinationCountryIso: draft.destinationCountryIso ?? null,
  };
  const legs = [...(draft.legs ?? [])];
  legs[index] = previous;
  return { ...draft, touched: true, activity: leg.label, timeHint: leg.timeHint ?? null, returnTimeHint: leg.returnTimeHint ?? null, selection: undefined, origin: { kind: "named", ...leg.origin }, destination: leg.destination, departureLocal: leg.departureLocal, timeZone: leg.timeZone, mode: leg.mode, timeKind: leg.timeKind ?? "depart_at", constraints: leg.constraints ?? "", paceMinutesPerKm: leg.paceMinutesPerKm, loopTarget: undefined, destinationCountryIso: leg.destinationCountryIso, legs };
}

export function resolvedOrigin(intent: MovementIntent): { lat: number; lon: number } | null {
  return intent.origin.kind === "device" ? intent.origin.point : intent.origin.resolution?.point ?? null;
}

export function resolvedDestination(intent: MovementIntent): { name: string; lat: number; lon: number } | null {
  if (!intent.destination?.resolution) return null;
  return { name: intent.destination.query, ...intent.destination.resolution.point };
}

/**
 * Place provenance (sprint mira-companion-48h review, issue 5). A resolution's placeId names where a place came from:
 * "g:" is a Google result (display content Mira may show but not keep), "osm:" OpenStreetMap, a bare id a saved place.
 * "x:unknown" marks a provider-derived place whose source wasn't recorded (e.g. a chat card saved before cards carried
 * ids): it is treated like Google content. A point she picked on the map has no placeId and stays hers.
 */
export const UNKNOWN_PROVENANCE = "x:unknown";
/** What a plan calls a place whose provider name it may not keep: her words, not the provider's. */
export const CHOSEN_PLACE = "Place you chose";
export function isRestrictedPlaceId(id: string | undefined | null): boolean {
  return Boolean(id && (id.startsWith("g:") || id.startsWith("x:")));
}

/** A place that came from a provider via a card or hand-off: its id when known, otherwise marked unknown. */
export function providerPlace(p: { name: string; lat: number; lon: number; placeId?: string; savedPlaceId?: string }): { query: string; activity: string; resolution: PlanPlaceResolution } {
  if (p.savedPlaceId) return { query: p.name.slice(0, 160), activity: `Go to ${p.name}`.slice(0, 160), resolution: { source: "saved_place", name: p.name, point: { lat: p.lat, lon: p.lon }, placeId: p.savedPlaceId } };
  const placeId = p.placeId || UNKNOWN_PROVENANCE;
  // Restricted content is shown from the tab's resolution only; nothing kept as hers repeats its name.
  const restricted = isRestrictedPlaceId(placeId);
  return { query: restricted ? CHOSEN_PLACE : p.name.slice(0, 160), activity: restricted ? "Go to a place you chose" : `Go to ${p.name}`.slice(0, 160), resolution: { source: "search", name: p.name, point: { lat: p.lat, lon: p.lon }, placeId } };
}

/** A session lasts at most two hours without edits; it is not account history. */
export const PLAN_SESSION_TTL_MS = 2 * 60 * 60_000;
export function parsePlanSession(raw: string | null, now: number): PlanDraft | null {
  if (!raw) return null;
  try {
    const parsed = z.object({ savedAt: z.number().int(), draft: planDraftSchema }).strict().safeParse(JSON.parse(raw));
    if (!parsed.success || parsed.data.savedAt > now || now - parsed.data.savedAt >= PLAN_SESSION_TTL_MS) return null;
    return { ...parsed.data.draft, version: PLAN_CONTRACT_VERSION, timeKind: parsed.data.draft.timeKind ?? "depart_at" };
  } catch { return null; }
}
export function serializePlanSession(draft: PlanDraft, now: number): string {
  const valid = planDraftSchema.parse(draft);
  // Google Places content (name/coordinates) — and provider content of unknown source — is display-only. Keep a
  // user's typed query, but ask them to resolve such a result again after a page reload.
  const origin = valid.origin.kind === "named" && isRestrictedPlaceId(valid.origin.resolution?.placeId)
    ? { ...valid.origin, resolution: null } : valid.origin;
  const destination = isRestrictedPlaceId(valid.destination.resolution?.placeId)
    ? { ...valid.destination, resolution: null } : valid.destination;
  const scrub = (place: PlanLegDraft["origin"]) => isRestrictedPlaceId(place.resolution?.placeId) ? { ...place, resolution: null } : place;
  const legs = valid.legs?.map((leg) => ({ ...leg, origin: scrub(leg.origin), destination: scrub(leg.destination) }));
  return JSON.stringify({ savedAt: now, draft: { ...valid, origin, destination, ...(legs ? { legs } : {}) } });
}
