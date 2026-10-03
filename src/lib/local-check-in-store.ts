import { createLocalCheckIn, LOCAL_CHECK_IN_KEY, parseLocalCheckIn, type LocalCheckIn } from "@/domain/local-check-in";
import { movementIntentSchema, type MovementIntent } from "@/domain/plan-contract";
import type { PlanOption } from "@/domain/plan-options";
import { instantForLocal, planOptionsKey } from "@/domain/plan-options";
import { PLAN_SESSION_TTL_MS } from "@/domain/plan-state";
import { useEffect, useSyncExternalStore } from "react";

let memory: LocalCheckIn | null = null;
// The chosen route is memory-only: it is never added to account history or an offline cache.
let journey: { plan: MovementIntent; option: PlanOption | null; progress: number; checkedInAt: number | null; updatedAt: number | null; savedAt: number } | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export function useLocalJourney() { return useSyncExternalStore(subscribe, readLocalJourney, () => null); }
export function useLocalJourneyActive() { const active = useSyncExternalStore(subscribe, () => Boolean(readLocalCheckIn()), () => false); useEffect(() => { const timer = setInterval(emit, 15_000); return () => clearInterval(timer); }, []); return active; }
const CHOICE_KEY = "mira.local-journey-choice.v1";
function fingerprint(plan: MovementIntent) { let n = 2166136261; for (const c of planOptionsKey(plan) || JSON.stringify(plan)) n = Math.imul(n ^ c.charCodeAt(0), 16777619); return (n >>> 0).toString(16); }
function rememberJourney(plan: MovementIntent, option: PlanOption | null, updatedAt: number | null, now: number) {
  journey = { plan, option, progress: 0, checkedInAt: null, updatedAt, savedAt: now };
  try { sessionStorage.setItem(CHOICE_KEY, JSON.stringify({ context: fingerprint(plan), optionId: option?.id ?? null, progress: 0, checkedInAt: null, updatedAt, savedAt: now })); } catch { /* memory-only */ }
}
export function startLocalJourney(plan: MovementIntent, option: PlanOption | null, minutes: number) {
  if (readLocalCheckIn()) return null;
  const entry = startLocalCheckIn(minutes);
  if (entry) { rememberJourney(plan, option, null, entry.startedAt); emit(); }
  return entry;
}
/** Update the reviewed timer, never replace it with a second start or extend its original cap. */
export function updateLocalJourney(plan: MovementIntent, option: PlanOption | null, minutes: number, expected: LocalCheckIn, now = Date.now()): LocalCheckIn | null {
  const entry = readLocalCheckIn(now);
  if (!entry || entry.startedAt !== expected.startedAt || entry.dueAt !== expected.dueAt) return null;
  if (!movementIntentSchema.safeParse(plan).success || !instantForLocal(plan.departure.local, plan.departure.timeZone)) return null;
  if (!Number.isInteger(minutes) || minutes < 5 || minutes > 235 || !Number.isSafeInteger(now)) return null;
  const dueAt = now + minutes * 60_000;
  if (dueAt > entry.startedAt + 235 * 60_000) return null;
  memory = { ...entry, dueAt };
  try { sessionStorage.setItem(LOCAL_CHECK_IN_KEY, JSON.stringify(memory)); } catch { /* tab-memory fallback */ }
  rememberJourney(plan, option, now, now);
  emit();
  return memory;
}
export function readLocalJourney() {
  if (!readLocalCheckIn()) return null;
  if (journey && Date.now() - journey.savedAt >= PLAN_SESSION_TTL_MS) { journey = null; try { sessionStorage.removeItem(CHOICE_KEY); } catch { /* memory cleared */ } }
  return journey;
}
export function localJourneyChoice(plan: MovementIntent): { optionId: string | null; progress: number; checkedInAt: number | null; updatedAt: number | null; savedAt: number } | null {
  const entry = readLocalCheckIn(); if (!entry) return null;
  try {
    const raw = JSON.parse(sessionStorage.getItem(CHOICE_KEY) ?? "null");
    if (!raw) return null;
    const savedAt = raw?.savedAt ?? entry.startedAt;
    if (!Number.isSafeInteger(savedAt) || savedAt > Date.now() || savedAt < entry.startedAt || Date.now() - savedAt >= PLAN_SESSION_TTL_MS) { sessionStorage.removeItem(CHOICE_KEY); journey = null; return null; }
    if (raw?.context === fingerprint(plan) && (raw.optionId === null || typeof raw.optionId === "string") && Number.isFinite(raw.progress)) return { optionId: raw.optionId, progress: Math.max(0, Math.min(100, raw.progress)), checkedInAt: Number.isSafeInteger(raw.checkedInAt) && raw.checkedInAt <= Date.now() ? raw.checkedInAt : null, updatedAt: Number.isSafeInteger(raw.updatedAt) && raw.updatedAt >= entry.startedAt && raw.updatedAt <= Date.now() ? raw.updatedAt : null, savedAt };
  } catch { /* unavailable */ }
  return null;
}
export function restoreLocalJourney(plan: MovementIntent, option: PlanOption | null, progress: number, checkedInAt: number | null = null) { const choice = localJourneyChoice(plan); if (choice && choice.optionId === (option?.id ?? null)) { journey = { plan, option, progress, checkedInAt, updatedAt: choice.updatedAt, savedAt: choice.savedAt }; emit(); } }
export function recordLocalJourneyCheckIn() { if (journey && readLocalCheckIn()) { journey = { ...journey, checkedInAt: Date.now() }; try { const raw = JSON.parse(sessionStorage.getItem(CHOICE_KEY) ?? "null"); if (raw) sessionStorage.setItem(CHOICE_KEY, JSON.stringify({ ...raw, checkedInAt: journey.checkedInAt })); } catch { /* memory-only */ } emit(); } }
export function markLocalProgress(progress: number) { if (journey) { journey = { ...journey, progress: Math.max(0, Math.min(100, progress)) }; try { const raw = JSON.parse(sessionStorage.getItem(CHOICE_KEY) ?? "null"); if (raw) sessionStorage.setItem(CHOICE_KEY, JSON.stringify({ ...raw, progress: journey.progress })); } catch { /* memory-only */ } emit(); } }

/** A plan's two-hour retention applies to its in-memory guidance too, independently of the timer. */
export function clearLocalJourneyGuidance() {
  journey = null;
  try { sessionStorage.removeItem(CHOICE_KEY); } catch { /* memory cleared */ }
  emit();
}

export function startLocalCheckIn(minutes: number, now = Date.now()): LocalCheckIn | null {
  const value = createLocalCheckIn(minutes, now);
  if (!value) return null;
  memory = value;
  try { sessionStorage.setItem(LOCAL_CHECK_IN_KEY, JSON.stringify(value)); } catch { /* tab-memory fallback */ }
  return value;
}

export function readLocalCheckIn(now = Date.now()): LocalCheckIn | null {
  try {
    const stored = sessionStorage.getItem(LOCAL_CHECK_IN_KEY);
    if (stored) { const parsed = parseLocalCheckIn(stored, now); if (!parsed) { memory = null; journey = null; sessionStorage.removeItem(LOCAL_CHECK_IN_KEY); sessionStorage.removeItem(CHOICE_KEY); } return parsed; }
  } catch { /* tab-memory fallback */ }
  const parsed = memory ? parseLocalCheckIn(JSON.stringify(memory), now) : null;
  if (!parsed) { memory = null; journey = null; }
  return parsed;
}

export function endLocalCheckIn(): void {
  memory = null;
  journey = null;
  try { sessionStorage.removeItem(CHOICE_KEY); } catch { /* memory cleared */ }
  try { sessionStorage.removeItem(LOCAL_CHECK_IN_KEY); } catch { /* memory cleared */ }
  emit();
}
