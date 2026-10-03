/** Deterministic presentation fixtures only: never evidence of a real path or operating service. */
import type { MovementIntent } from "../../src/domain/plan-contract";
import type { PlanOptionsResult } from "../../src/domain/plan-options";

export function fixtureOptions(intent: MovementIntent, options = [{ id: "fixture-walk", label: "Fixture mapped walk", minutes: 12, meters: 850 }]): PlanOptionsResult {
  const from = intent.origin.kind === "named" ? intent.origin.resolution?.point : intent.origin.point;
  const to = intent.loop ? from : intent.destination?.resolution?.point;
  if (!from || !to) throw new Error("Fixture requires explicitly resolved places");
  const checkedAt = new Date().toISOString();
  return {
    state: "ready", checkedAt, source: "Deterministic graph fixture — test only", sourceAt: checkedAt, scope: "fictional browser journey",
    options: options.map((option) => ({ ...option, geometry: intent.loop ? [[from.lon, from.lat], [from.lon + .004, from.lat], [from.lon + .004, from.lat + .004], [from.lon, from.lat]] : [[from.lon, from.lat], [to.lon, to.lat]], steps: [{ name: "Fictional pedestrian segment", highway: "footway", lengthM: option.meters }], originAccessMeters: 0, evidence: [{ status: "known", claim: "Fixture distance estimate", value: option.minutes, scope: { kind: "route", ref: "fictional-fixture" }, source: { id: "fixture", label: "Fixture graph — test only", observedAt: checkedAt, expiresAt: null } }] })),
    daylight: { status: "unknown", claim: "Daylight", scope: { kind: "area", ref: "fixture" }, reason: "not_checked", retryable: false },
    service: { status: "unknown", claim: "Operating service", scope: { kind: "route", ref: "fixture" }, reason: "unsupported", retryable: false }, detail: "Fictional fixture paths. No live route, accessibility, service or safety evidence.",
  };
}
