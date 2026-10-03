"use client";

import { setPlanDraft } from "@/lib/plan-store";
import { newPlanDraft } from "@/domain/plan-state";

const zone = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch { return "UTC"; } };

/**
 * A plan to one place, from where you are, leaving now — the shortest way into a brief with
 * "Go with Mira". Used where speed matters (I feel unsafe → a Help Point) and by the map.
 */
export function planGoingTo(to: { name: string; lat: number; lon: number; source?: "search" | "saved_place" | "selected_point"; placeId?: string }, from: { lat: number; lon: number } | null) {
  setPlanDraft({
    ...newPlanDraft(new Date(), zone()),
    touched: true,
    activity: `Go to ${to.name}`.slice(0, 160),
    ...(from ? { origin: { kind: "device" as const, use: "from_here" as const, point: { lat: from.lat, lon: from.lon } } } : {}),
    destination: { query: to.name.slice(0, 160), resolution: { source: to.source ?? "selected_point", name: to.name, point: { lat: to.lat, lon: to.lon }, ...(to.placeId ? { placeId: to.placeId } : {}) } },
  });
}
