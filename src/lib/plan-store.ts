"use client";

import { useEffect, useSyncExternalStore } from "react";
import { newPlanDraft, parsePlanSession, PLAN_SESSION_TTL_MS, planDraftSchema, serializePlanSession, type PlanDraft } from "@/domain/plan-state";

const KEY = "mira.plan.v1";
let draft: PlanDraft | null = null;
let hydrated = false;
let expiryTimer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());
function scheduleExpiry(remainingMs: number) {
  if (expiryTimer) clearTimeout(expiryTimer);
  expiryTimer = setTimeout(clearPlanDraft, remainingMs);
}

export function hydratePlan() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  try {
    const raw = sessionStorage.getItem(KEY);
    draft = parsePlanSession(raw, Date.now());
    if (draft && raw) scheduleExpiry(PLAN_SESSION_TTL_MS - (Date.now() - (JSON.parse(raw) as { savedAt: number }).savedAt));
    if (!draft) sessionStorage.removeItem(KEY);
  } catch { draft = null; }
  emit();
}

export function setPlanDraft(next: PlanDraft) {
  draft = planDraftSchema.parse(next);
  hydrated = true;
  const now = Date.now();
  try { sessionStorage.setItem(KEY, serializePlanSession(draft, now)); } catch { /* memory-only fallback */ }
  scheduleExpiry(PLAN_SESSION_TTL_MS);
  emit();
}

export function clearPlanDraft() {
  if (expiryTimer) clearTimeout(expiryTimer);
  expiryTimer = null;
  draft = null;
  hydrated = true;
  try { sessionStorage.removeItem(KEY); } catch { /* memory-only fallback */ }
  emit();
}

export function ensurePlanDraft() {
  hydratePlan();
  if (draft) return;
  let timeZone = "UTC";
  try { timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch { /* UTC is explicit fallback */ }
  setPlanDraft(newPlanDraft(new Date(), timeZone));
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
export function usePlanDraft(): PlanDraft | null {
  const current = useSyncExternalStore(subscribe, () => draft, () => null);
  useEffect(hydratePlan, []);
  return current;
}
export function usePlanHydrated(): boolean {
  return useSyncExternalStore(subscribe, () => hydrated, () => false);
}
