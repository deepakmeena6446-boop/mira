"use client";

import { useSyncExternalStore } from "react";

const QUERY = "(min-width: 1024px)";
const subscribe = (cb: () => void) => {
  const m = window.matchMedia(QUERY);
  m.addEventListener("change", cb);
  return () => m.removeEventListener("change", cb);
};

/** Desktop side-panel layout (docs/launch-ux/04 §29): true at ≥ 1024 px. False on the server. */
export function useWide(): boolean {
  return useSyncExternalStore(subscribe, () => window.matchMedia(QUERY).matches, () => false);
}
