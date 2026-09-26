/**
 * The emergency number MIRA shows. One place for it, so the Location Context (a cited,
 * reviewed profile per country, gap analysis P1) can replace this without touching the
 * screens. Until then: India first, and 112 connects to emergency services on most mobile
 * networks worldwide (a GSM standard), which is why it's the fallback everywhere.
 *
 * MIRA never places the call itself and never implies it dispatches anyone: the button
 * opens the phone's own dialler, which on Android can also send the handset's location
 * to 112 where the state supports it (ELS). An app-placed call would lose that.
 */
export const EMERGENCY_NUMBER = "112";

export function emergencyHref(): string {
  return `tel:${EMERGENCY_NUMBER}`;
}
