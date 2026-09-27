// Pure (no server-only): also used by scripts/mira-eval.ts.

/**
 * Where MIRA's facts come from in this deployment, stated in the context block (honest coverage).
 * Safety updates are news reports about a city (src/server/safety-intel), not a rating: MIRA
 * still has no crime scores or neighbourhood data, and the line must say both.
 */
export function coverageLine(googleMaps: boolean, safetyUpdates = false): string {
  const places = googleMaps ? "Google Maps (OpenStreetMap as fallback)" : "OpenStreetMap";
  const updates = safetyUpdates
    ? "Safety updates: recent news reports about women's safety for a whole city (get_safety_updates; each with its publisher and date) — reported context, never a verdict on an area, and an empty or failed check proves nothing."
    : "Safety updates (news reports for a city) are switched off in this deployment.";
  return `Help Points and nearby places: ${places}, with opening hours only as the source lists them. Lighting: OpenStreetMap street-lamp tags and Mapillary street imagery where mapped, checked along a walking route after dark. MIRA has no crime scores, crime maps or neighbourhood safety ratings anywhere. ${updates}`;
}
