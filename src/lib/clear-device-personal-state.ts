"use client";

import { clearPlanDraft } from "@/lib/plan-store";
import { clearLocation } from "@/lib/location-store";
import { endLocalCheckIn } from "@/lib/local-check-in-store";
import { resetLocalPersonalisation } from "@/lib/usage-signal";
import { clearPlanOptionChoice } from "@/components/app/PlanOptions";

/** Successful sign-out/deletion ends this device's personal state before another account uses it. */
export function clearDevicePersonalState() {
  clearPlanDraft();
  clearPlanOptionChoice();
  endLocalCheckIn();
  clearLocation();
  resetLocalPersonalisation();
  try {
    for (const key of Object.keys(sessionStorage)) if (key.startsWith("mira.")) sessionStorage.removeItem(key);
  } catch { /* memory stores above are still cleared when browser storage is unavailable */ }
}
