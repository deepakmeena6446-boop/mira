/**
 * A loggable reason for an error. MIRA's own codes ("places_403", "overpass_retry_later") pass
 * through — they're what makes a failure diagnosable. Anything else is reduced to its class
 * name: provider and driver messages can echo request URLs (with API keys), emails or places.
 */
export function errCode(err: unknown): string {
  if (!(err instanceof Error)) return "unknown";
  return /^[a-z][a-z0-9_]{1,60}$/.test(err.message) ? err.message : err.name;
}
