/**
 * Small haptic confirmations (docs/launch-ux/05 §5): Android/Chromium only (iOS Safari has no
 * Vibration API — no overlay hacks). Always paired with visible text; never the only signal.
 */
export function haptic(kind: "journey-start" | "arrived" | "press") {
  try {
    const pattern = kind === "arrived" ? [10, 60, 10] : kind === "journey-start" ? 10 : 8;
    if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(pattern);
  } catch {
    /* unsupported or blocked: the visible confirmation is enough */
  }
}
