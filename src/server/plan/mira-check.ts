import "server-only";
import type postgres from "postgres";
import type { MovementIntent } from "@/domain/plan-contract";
import { planEvidenceSchema } from "@/domain/plan-contract";
import { resolvedDestination, resolvedOrigin } from "@/domain/plan-state";
import { haversineMeters } from "@/domain/pilot";
import type { PlanOptionsResult } from "@/domain/plan-options";
import { planOptionsFor } from "./options";
import { localWhen } from "@/domain/plan-ask";
import type { MiraCard } from "@/server/providers/companion/types";

/** Beyond this, the imported walking graph doesn't reach: the plan is checked as "too far", never guessed. */
const LOCAL_COMPARISON_M = 25_000;

/**
 * What Mira may say about the plan she has open, and the card that shows it. Facts are names, minutes,
 * kilometres, daylight and sources — never coordinates (Claude never sees a position). The same evidence
 * engine as the Plan screen: Mira words it, she doesn't decide it.
 */
export interface PlanCheck {
  facts: Record<string, unknown>;
  /** The raw evidence, for the scripted fallback's deterministic answer. */
  evidence: PlanOptionsResult | null;
  card: Extract<MiraCard, { type: "plan_brief" }>;
}

const placeName = (p: MovementIntent["origin"] | MovementIntent["destination"]): string | null =>
  !p ? null : p.kind === "device" ? "where she is now" : p.resolution ? p.query : `${p.query} (not yet chosen from search results)`;

export async function checkPlanForMira(sql: postgres.Sql, plan: MovementIntent, now = new Date()): Promise<PlanCheck> {
  const from = resolvedOrigin(plan);
  const to = plan.loop ? from : resolvedDestination(plan);
  const tooFar = Boolean(from && to && haversineMeters(from, to) > LOCAL_COMPARISON_M);
  let evidence: PlanOptionsResult | null = null;
  if (from && to && !tooFar) {
    evidence = await planOptionsFor(sql, from, to, plan.departure, now, plan).catch(() => null);
    if (evidence) for (const e of [evidence.daylight, evidence.service]) planEvidenceSchema.parse(e);
  }
  const notChecked = !from ? "she hasn't chosen the starting place from the search results yet"
    : !to ? "she hasn't chosen the destination from the search results yet"
    : tooFar ? "the places are further apart than MIRA's local walking comparison covers (25 km)"
    : !evidence ? "MIRA couldn't check it just now (she can retry in Plan)"
    : null;
  const daylight = evidence?.daylight.status === "known" ? String(evidence.daylight.value) : "not known";
  const facts = {
    from: placeName(plan.origin),
    to: plan.loop ? "a loop back to the start" : placeName(plan.destination),
    activity: plan.activity,
    mode: plan.mode,
    departure: `${localWhen(plan.departure.local)} (${plan.departure.timeZone})${plan.timeKind === "arrive_by" ? ", arrive by" : ""}`,
    checked: notChecked ? "no" : evidence!.state,
    ...(notChecked ? { why_not_checked: notChecked } : {}),
    daylight_at_departure: daylight,
    ways: (evidence?.options ?? []).slice(0, 3).map((o) => ({ label: o.label, minutes: Math.round(o.minutes), km: Number((o.meters / 1000).toFixed(1)) })),
    ...(evidence && evidence.state !== "ready" ? { detail: evidence.detail } : {}),
    ...(evidence?.timeAlternatives?.[0] ? { later_daylight: `${localWhen(evidence.timeAlternatives[0].local)} (${evidence.timeAlternatives[0].timeZone}), ${evidence.timeAlternatives[0].minutesLater} min later` } : {}),
    // No `scope`: for a route it is both points as coordinates, and Mira repeats what she is given (audit L02-002).
    source: evidence ? `${evidence.source ?? "unknown"}, data from ${evidence.sourceAt?.slice(0, 10) ?? "an unknown date"}` : null,
    not_verified: ["lighting and activity at that time", "opening hours then", plan.mode === "walk" ? "live conditions" : `${plan.mode} service at that time`],
  };
  const card: PlanCheck["card"] = {
    type: "plan_brief",
    next: evidence?.state === "ready" && evidence.options.length ? "review_options" : "edit_plan",
    state: evidence?.state ?? "not_checked",
    checkedAt: evidence?.checkedAt ?? now.toISOString(),
    source: evidence?.source ?? null,
    sourceAt: evidence?.sourceAt ?? null,
    scope: evidence?.scope ?? null,
    options: evidence?.options.map(({ id, label, minutes, meters }) => ({ id, label, minutes, meters })) ?? [],
    daylight: evidence?.daylight ?? null,
  };
  return { facts, evidence, card };
}
