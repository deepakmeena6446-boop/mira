// Pure (no server-only): also used by scripts/mira-eval.ts.

/** Where MIRA's facts come from in this deployment, stated in the context block (honest coverage). */
export function coverageLine(googleMaps: boolean): string {
  const places = googleMaps ? "Google Maps (OpenStreetMap as fallback)" : "OpenStreetMap";
  return `Help Points and nearby places: ${places}, with opening hours only as the source lists them. Lighting: OpenStreetMap street-lamp tags and Mapillary street imagery where mapped, checked along a walking route after dark. MIRA has no crime, incident or neighbourhood-safety data anywhere.`;
}
