import { createLocalCheckIn, LOCAL_CHECK_IN_KEY, parseLocalCheckIn, type LocalCheckIn } from "@/domain/local-check-in";

let memory: LocalCheckIn | null = null;

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
    if (stored) return parseLocalCheckIn(stored, now);
  } catch { /* tab-memory fallback */ }
  return memory ? parseLocalCheckIn(JSON.stringify(memory), now) : null;
}

export function endLocalCheckIn(): void {
  memory = null;
  try { sessionStorage.removeItem(LOCAL_CHECK_IN_KEY); } catch { /* memory cleared */ }
}
