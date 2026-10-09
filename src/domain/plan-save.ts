import { intentFromDraft, intentFromLeg, type PlanDraft } from "./plan-state";

/**
 * Whether a tab plan can be saved to the account, said before she taps Save (sprint mira-companion-48h
 * 01 "Save boundary"). The same rules back the server's guard (src/server/account/saved-plans.ts), which
 * stays authoritative. Content problems come first, so she isn't sent to sign in for a plan that still
 * couldn't be saved.
 */
export type SaveBlock = "incomplete_plan" | "device_origin" | "provider_content" | "incomplete_leg" | "guest";
export type SaveEligibility = { ok: true } | { ok: false; code: SaveBlock; message: string; legIndex?: number };

/** The tab's own lifetime, said wherever saving isn't possible. */
export const TAB_PLAN_NOTE = "It stays in this tab for 2 hours after your last change.";

export const isProviderPlace = (place: { resolution?: { placeId?: string } | null }) => place.resolution?.placeId?.startsWith("g:") ?? false;

export function saveEligibility(draft: PlanDraft, { signedIn }: { signedIn: boolean }): SaveEligibility {
  if (draft.origin.kind === "device") return { ok: false, code: "device_origin", message: "Choose a named starting place to save this plan." };
  if (!intentFromDraft(draft)) return { ok: false, code: "incomplete_plan", message: "Choose the places and a time before saving this plan." };
  if (isProviderPlace(draft.origin) || isProviderPlace(draft.destination) || draft.legs?.some((leg) => isProviderPlace(leg.origin) || isProviderPlace(leg.destination))) {
    return { ok: false, code: "provider_content", message: `This plan can stay in this tab, but Mira can’t save these place details to your account yet. You may need to choose the places again after a reload. ${TAB_PLAN_NOTE}` };
  }
  const legIndex = draft.legs?.findIndex((leg) => !intentFromLeg(leg)) ?? -1;
  if (legIndex >= 0) {
    const leg = draft.legs![legIndex];
    const name = /^return\b/i.test(leg.label) ? "the way back" : `leg ${legIndex + 2}`;
    const missing = !leg.destination.resolution && !leg.destination.query.trim() ? "where it goes" : !leg.departureLocal ? "when it leaves" : "its places";
    return { ok: false, code: "incomplete_leg", legIndex, message: `Finish ${name} — choose ${missing} — to save this plan.` };
  }
  if (!signedIn) return { ok: false, code: "guest", message: "Sign in to save. This plan stays in this tab while you do." };
  return { ok: true };
}
