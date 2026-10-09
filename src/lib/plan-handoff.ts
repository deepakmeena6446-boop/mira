"use client";

import { setPlanDraft } from "@/lib/plan-store";
import { newPlanDraft, providerPlace } from "@/domain/plan-state";

const zone = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch { return "UTC"; } };

/**
 * A plan to one place, from where you are, leaving now — the shortest way into a brief with
 * "Go with Mira". Used where speed matters (I feel unsafe → a Help Point) and by the map.
 */
export function planGoingTo(to: { name: string; lat: number; lon: number; source?: "search" | "saved_place" | "selected_point"; placeId?: string }, from: { lat: number; lon: number } | null) {
  // A provider place keeps its provenance (Google and unknown-source places stay in the tab only); a point she
  // picked on the map, or one of her saved places, is hers.
  const place = to.source === "saved_place" && to.placeId ? providerPlace({ ...to, savedPlaceId: to.placeId })
    : to.source === "search" || to.placeId ? providerPlace(to)
    : { query: to.name.slice(0, 160), activity: `Go to ${to.name}`.slice(0, 160), resolution: { source: "selected_point" as const, name: to.name, point: { lat: to.lat, lon: to.lon } } };
  setPlanDraft({
    ...newPlanDraft(new Date(), zone()),
    touched: true,
    activity: place.activity,
    ...(from ? { origin: { kind: "device" as const, use: "from_here" as const, point: { lat: from.lat, lon: from.lon } } } : {}),
    destination: { query: place.query, resolution: place.resolution },
  });
}

/** A plan to a place offered on one of Mira's cards: provider provenance travels with it (missing = unknown). */
export function planToCardPlace(d: { name: string; lat: number; lon: number; savedPlaceId?: string; placeId?: string }, from: { lat: number; lon: number } | null) {
  const place = providerPlace(d);
  setPlanDraft({
    ...newPlanDraft(new Date(), zone()),
    touched: true,
    activity: place.activity,
    ...(from ? { origin: { kind: "device" as const, use: "from_here" as const, point: { lat: from.lat, lon: from.lon } } } : {}),
    destination: { query: place.query, resolution: place.resolution },
  });
}
