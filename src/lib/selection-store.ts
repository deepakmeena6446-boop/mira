"use client";

import { useSyncExternalStore } from "react";

/**
 * In-memory hand-off of a picked place between screens (e.g. Home → Accompany).
 * Lives only in this tab's JS memory: never in the URL, localStorage or cookies,
 * and disappears on reload (UX spec §1).
 */
export interface PlaceSummary {
  id: string;
  name: string;
  kind: string;
}

let selected: PlaceSummary | null = null;
const listeners = new Set<() => void>();

export function setSelectedPlace(p: PlaceSummary | null): void {
  selected = p;
  for (const l of listeners) l();
}

export function useSelectedPlace(): PlaceSummary | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => selected,
    () => null,
  );
}
