import { z } from "zod";
import { TRAVEL_MODES } from "./travel-mode";

/** Versioned movement contracts. Phase 1 binds only the intent schema to transient client state. */
export const PLAN_CONTRACT_VERSION = 1 as const;

const point = z.object({ lat: z.number().min(-90).max(90), lon: z.number().min(-180).max(180) }).strict();
const namedPlace = z.object({
  kind: z.literal("named"),
  query: z.string().trim().min(1).max(160),
  resolution: z.object({ source: z.enum(["search", "saved_place", "selected_point"]), point, placeId: z.string().min(1).optional() }).strict().optional(),
}).strict();
const deviceOrigin = z.object({ kind: z.literal("device"), use: z.literal("from_here"), point }).strict();
export const planOriginSchema = z.discriminatedUnion("kind", [namedPlace, deviceOrigin]);

/** Local wall time and IANA zone travel together; a device's current zone is never implied. */
export const plannedTimeSchema = z.object({
  local: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/).refine((value) => {
    const [year, month, day, hour, minute] = value.split(/[-T:]/).map(Number);
    const date = new Date(Date.UTC(year, month - 1, day, hour, minute));
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day && date.getUTCHours() === hour && date.getUTCMinutes() === minute;
  }),
  timeZone: z.string().min(1).max(64).refine((zone) => {
    try { new Intl.DateTimeFormat("en", { timeZone: zone }); return true; } catch { return false; }
  }),
}).strict();

export const movementIntentSchema = z.object({
  version: z.literal(PLAN_CONTRACT_VERSION),
  activity: z.string().trim().min(1).max(160),
  origin: planOriginSchema,
  destination: namedPlace.nullable(),
  loop: z.boolean(),
  departure: plannedTimeSchema,
  mode: z.enum(TRAVEL_MODES),
  constraints: z.array(z.string().trim().min(1).max(120)).max(8),
}).strict().refine((v) => v.loop || v.destination !== null, { path: ["destination"], message: "A one-way plan needs a destination" });
export type MovementIntent = z.infer<typeof movementIntentSchema>;

const claimScope = z.object({ kind: z.enum(["place", "route", "area", "country"]), ref: z.string().min(1), timeZone: z.string().optional() }).strict();
const source = z.object({ id: z.string().min(1), label: z.string().min(1), observedAt: z.iso.datetime({ offset: true }), expiresAt: z.iso.datetime({ offset: true }).nullable() }).strict();
/** Unknown is a first-class result and carries no value that could be mistaken for evidence. */
export const planEvidenceSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("known"), claim: z.string().min(1), value: z.union([z.string(), z.number(), z.boolean()]), scope: claimScope, source }).strict(),
  z.object({ status: z.literal("unknown"), claim: z.string().min(1), scope: claimScope, reason: z.enum(["not_checked", "no_data", "provider_failed", "stale", "conflicting", "unsupported"]), retryable: z.boolean() }).strict(),
]);
export type PlanEvidence = z.infer<typeof planEvidenceSchema>;

/** A proposed side effect is never an execution receipt. The caller must obtain confirmation. */
export const planActionSchema = z.discriminatedUnion("state", [
  z.object({ state: z.literal("proposed"), proposalId: z.string().min(1), kind: z.enum(["start_journey", "change_journey", "share", "save_plan", "contact"]), summary: z.string().min(1), requiresConfirmation: z.literal(true) }).strict(),
  z.object({ state: z.literal("confirmed"), proposalId: z.string().min(1), receiptId: z.string().min(1), kind: z.enum(["start_journey", "change_journey", "share", "save_plan", "contact"]), completedAt: z.iso.datetime({ offset: true }) }).strict(),
  z.object({ state: z.literal("failed"), proposalId: z.string().min(1), kind: z.enum(["start_journey", "change_journey", "share", "save_plan", "contact"]), reason: z.string().min(1) }).strict(),
]);
export type PlanAction = z.infer<typeof planActionSchema>;
