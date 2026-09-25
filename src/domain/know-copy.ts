/**
 * Copy rules for KNOW (UX spec §4). Facts are phrased as mapped/listed with their
 * limits; absent tags are unknown, never negative. No safety verdicts anywhere.
 */
export interface Fact {
  label: string;
  value?: string;
  note?: string;
}
import { TIME_BAND_LABEL, type TimeBand } from "./time-bands";

const WHEELCHAIR: Record<string, string> = {
  yes: "mapped as accessible",
  limited: "mapped as limited",
  no: "mapped as not accessible",
  designated: "mapped as designated",
};

export function displayName(name: string | null, kind: string): string {
  return name?.trim() ? name.trim() : `${kind} (name not mapped)`;
}

export function placeFacts(kind: string, tags: Record<string, string>): Fact[] {
  const facts: Fact[] = [{ label: `Mapped ${kind.charAt(0).toLowerCase()}${kind.slice(1)}` }];
  if (tags.opening_hours) {
    facts.push({ label: "Listed hours", value: tags.opening_hours, note: "May be outdated. Listed hours don't mean it is open right now." });
  }
  if (tags.wheelchair && WHEELCHAIR[tags.wheelchair]) facts.push({ label: "Wheelchair access", value: WHEELCHAIR[tags.wheelchair] });
  if (tags["toilets:wheelchair"] === "yes") facts.push({ label: "Wheelchair-accessible toilet", value: "mapped" });
  if (tags.operator) facts.push({ label: "Listed operator", value: tags.operator });
  if (tags.level) facts.push({ label: "Mapped level", value: tags.level });
  if (tags.dispensing === "yes") facts.push({ label: "Dispensing", value: "mapped as dispensing prescriptions" });
  if (tags.emergency === "yes") facts.push({ label: "Emergency department", value: "mapped" });
  if (tags.fee) facts.push({ label: "Fee", value: tags.fee === "yes" ? "mapped as paid" : tags.fee === "no" ? "mapped as free" : tags.fee });
  if (tags["addr:street"]) facts.push({ label: "Street", value: tags["addr:street"] });
  if (tags["name:hi"]) facts.push({ label: "Hindi name", value: tags["name:hi"] });
  return facts;
}

const PLURAL: Record<string, [string, string]> = {
  metro: ["metro entrance or station", "metro entrances or stations"],
  bus: ["bus stop", "bus stops"],
  pharmacy: ["pharmacy", "pharmacies"],
  health: ["clinic or hospital", "clinics or hospitals"],
  police: ["police location", "police locations"],
  food: ["café or eatery", "cafés or eateries"],
  shop: ["shop", "shops"],
  finance: ["bank or ATM", "banks or ATMs"],
  toilets: ["public toilet", "public toilets"],
  education: ["college or institute", "colleges or institutes"],
  library: ["library", "libraries"],
  accommodation: ["hostel or residence", "hostels or residences"],
  park: ["park or garden", "parks or gardens"],
  community: ["community place", "community places"],
};

export const NEARBY_TYPE_ORDER = ["metro", "bus", "pharmacy", "health", "police", "toilets", "food", "shop", "finance", "education", "library", "accommodation", "park", "community"];

export function countPhrase(type: string, n: number): string | null {
  const p = PLURAL[type];
  if (!p || n <= 0) return null;
  return `${n} mapped ${n === 1 ? p[0] : p[1]}`;
}

export function nearbyFacts(counts: Record<string, number>, radiusM: number, subject: string): Fact[] {
  const parts = NEARBY_TYPE_ORDER.map((t) => countPhrase(t, counts[t] ?? 0)).filter((x): x is string => !!x);
  if (parts.length === 0) {
    return [{ label: `Mapped places within ${radiusM} m of ${subject}`, value: "none in the map snapshot", note: "Places may exist that aren't mapped." }];
  }
  return [{ label: `Mapped within ${radiusM} m of ${subject}`, value: parts.join(", "), note: "From the map snapshot; unmapped places are not counted." }];
}

export function lightingFact(litYesM: number, litNoM: number, totalM: number): Fact {
  const pct = (m: number) => Math.round((m / Math.max(totalM, 1)) * 100);
  const unknown = Math.max(0, 100 - pct(litYesM) - pct(litNoM));
  if (litYesM === 0 && litNoM === 0) {
    return { label: "Street lighting", value: "not recorded in the map for this route", note: "Unrecorded is not the same as unlit. This says nothing about current lighting." };
  }
  const bits = [];
  if (litYesM > 0) bits.push(`${pct(litYesM)}% of the length is mapped with lighting`);
  if (litNoM > 0) bits.push(`${pct(litNoM)}% is mapped without lighting`);
  bits.push(`${unknown}% has no lighting information`);
  return { label: "Street lighting (map tags)", value: bits.join("; "), note: "Tags may be outdated and don't describe current conditions." };
}

export function placeUnknowns(hasHours: boolean, snapshotDate: string): string[] {
  const out = [
    "The map doesn't record current lighting, how busy the area is, or who is around.",
    `Mapped details come from an OpenStreetMap snapshot (${snapshotDate}) and may be outdated or incomplete. No one has checked this place for MIRA.`,
  ];
  out.push(hasHours ? "Listed hours don't tell us whether it is open right now." : "No opening hours are mapped, so we don't know when it is open.");
  return out;
}

export function routeUnknowns(snapshotDate: string): string[] {
  return [
    "Walking times are estimates at 4.5 km/h. They don't include waiting at crossings, gates, or detours.",
    "The map doesn't record current lighting, how busy a street is, or temporary closures.",
    `Routes use mapped walkways from an OpenStreetMap snapshot (${snapshotDate}); some paths may be missing, closed, or gated.`,
    "Routes are not ranked or recommended for safety. They are the shortest mapped path and, when one exists, a different mapped path.",
  ];
}

export const NO_COMMUNITY_STATEMENT = "No recent community observations are available here. This is not a statement about current conditions.";

export function communityStatement(band: TimeBand, matching: number, others: number): string {
  if (matching === 0 && others === 0) return NO_COMMUNITY_STATEMENT;
  if (matching === 0) {
    return `No reviewed community observations match ${TIME_BAND_LABEL[band]}. Observations for other times of day are listed separately and don't describe ${TIME_BAND_LABEL[band]}.`;
  }
  return "Combined from multiple independent, reviewed observations from the past four weeks. They are observations, not verified facts or a safety rating.";
}

export const ROUTE_UNAVAILABLE_MESSAGE = "Walking directions aren't available for these points yet.";

/** Words that must never appear in generated KNOW copy (tested). */
export const FORBIDDEN_VERDICT_WORDS = [/\bsafe\b/i, /\bsafer\b/i, /\bsafest\b/i, /\bunsafe\b/i, /\bdangerous\b/i, /\brisk score\b/i, /\bwell[- ]lit\b/i, /\bdeserted\b/i];
