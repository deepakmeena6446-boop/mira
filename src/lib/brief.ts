/**
 * Mira Brief builders (docs/phase1-ux/01 §1): API evidence → labelled claims. Pure functions over
 * existing response shapes; no fetching, no React. Every claim leads with the fact and says how Mira
 * knows it in a word or two; the absence of evidence is worded as absence, never as reassurance. What
 * no source can see is said once per screen, by blindSpotsClaim — not repeated on every row.
 */
import type { EvidenceState } from "@/domain/evidence-state";
import type { RouteLighting } from "@/domain/lighting";
import { HELP_CLASSES, SOURCE_SHORT, hoursState, type HelpPoint, type HoursState } from "@/domain/help-points";
import type { LocalTime } from "@/domain/opening-hours";
import { clock12 } from "@/domain/opening-hours";
import { daylightAt } from "@/domain/plan-options";
import { clockIn, daylightOutlook } from "@/domain/daylight";
import { lightingEvidenceLine, sourceList } from "@/components/app/LightingSummary";
import { CATEGORY_LABEL, ageLabel, type SafetyUpdatesData } from "@/domain/safety-updates";
import type { EvidenceKind } from "@/components/mira/Evidence";

export type Claim = { id: string; kind: EvidenceKind; topic: string; claim: string; source?: string; icon?: string };

export interface WayOption {
  route: { meters: number; minutes: number; geometry: Array<[number, number]>; approximate: boolean; provider?: string };
  lighting: RouteLighting | null;
  lightingEvidence?: EvidenceState<RouteLighting>;
  helpPoints: HelpPoint[];
  helpEvidence?: EvidenceState<HelpPoint[]>;
}
export type CommunityNote = { id: string; text: string; polarity: "positive" | "environmental" | "incident"; timeBand: string; lat: number; lon: number; week: string };

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Daylight at a planned instant, for open sky. */
export function daylightClaim(at: Date | null, point: { lat: number; lon: number } | null, timeZone: string | null, label = "at that time"): Claim {
  if (!at || !point) return { id: "daylight", kind: "none", topic: "Daylight", icon: "sun", claim: "Not calculated yet — choose a place and a time." };
  const outlook = daylightOutlook(at, point);
  if (!outlook) return { id: "daylight", kind: "none", topic: "Daylight", icon: "sun", claim: "Mira doesn’t calculate daylight this far north or south." };
  const state = daylightAt(at, point);
  const next = outlook.changeTo === "daylight" ? "daylight from" : state === "dark" && outlook.changeTo === "uncertain" ? "twilight from" : outlook.changeTo === "dark" ? "dark from" : "changes";
  const change = outlook.changeAt ? ` · ${next} about ${clockIn(outlook.changeAt, timeZone)}` : "";
  const words = state === "daylight" ? `Daylight ${label}` : state === "dark" ? `Dark ${label}` : `Twilight ${label}`;
  return { id: "daylight", kind: "checked", topic: "Daylight", icon: "sun", claim: `${words}${change}`, source: "Solar calculation" };
}

/** Lighting along one way, from the route's own evidence. */
export function lightingClaim(o: WayOption | null): Claim {
  if (!o) return { id: "lighting", kind: "pending", topic: "Lighting", icon: "lamp", claim: "Checking street lighting along the way…" };
  if (o.route.approximate) return { id: "lighting", kind: "none", topic: "Lighting", icon: "lamp", claim: "Not checked — this is a straight-line estimate, not a street route." };
  const e = o.lightingEvidence;
  if (e?.state === "failed") return { id: "lighting", kind: "failed", topic: "Lighting", icon: "lamp", claim: "Mira couldn’t reach its lighting sources just now." };
  if (e?.state === "unavailable") return { id: "lighting", kind: "none", topic: "Lighting", icon: "lamp", claim: "No lighting source is available for this way." };
  const l = o.lighting;
  const known = l ? l.summary.lit + l.summary.poles + l.summary.dark : 0;
  if (!l || known === 0) return { id: "lighting", kind: "nodata", topic: "Lighting", icon: "lamp", claim: "No street lights mapped on this way yet.", source: e && "sources" in e ? `Checked: ${e.sources.map((s) => s.source.replace(/^MIRA\b/, "Mira")).join(", ")}` : undefined };
  const walkers = l.confirmed?.lit || l.confirmed?.dark;
  return { id: "lighting", kind: walkers ? "people" : "checked", topic: "Lighting", icon: "lamp", claim: lightingEvidenceLine(e, l), source: sourceList(l) };
}

/** Help Points along a way (or near a place), with what their listed hours say at that time. */
export function helpClaim(points: HelpPoint[], evidence: EvidenceState<HelpPoint[]> | undefined, at: LocalTime | null, where = "on this way", atLabel = "then"): Claim {
  if (!evidence) return { id: "help", kind: "pending", topic: "Help Points", icon: "shield", claim: "Looking for Help Points…" };
  if (evidence.state === "failed") return { id: "help", kind: "failed", topic: "Help Points", icon: "shield", claim: "Mira couldn’t check Help Points just now." };
  if (evidence.state === "unavailable") return { id: "help", kind: "none", topic: "Help Points", icon: "shield", claim: "Help Point sources aren’t available here." };
  if (!points.length) return { id: "help", kind: "nodata", topic: "Help Points", icon: "shield", claim: `None found ${where} in the sources checked.` };
  const states = points.map((p) => hoursState(p, at ?? undefined));
  const open = states.filter((h) => h.kind === "open_24h" || h.kind === "listed_open" || h.kind === "open_now").length;
  const closed = states.filter((h) => h.kind === "closed").length;
  const kinds = [...new Set(points.map((p) => HELP_CLASSES[p.cls].label.toLowerCase()))].slice(0, 3).join(", ");
  const timePart = at ? ` · ${open} open ${atLabel}${closed ? `, ${closed} closed` : ""}` : "";
  const sources = [...new Set(points.map((p) => SOURCE_SHORT[p.hoursSource ?? p.source]))].join(" + ");
  return { id: "help", kind: "checked", topic: "Help Points", icon: "shield", claim: `${plural(points.length, "Help Point")} ${where} (${kinds})${timePart}`, source: `${sources} · listed hours${evidence.state === "partial" ? " · some sources couldn’t be checked" : ""}` };
}

export function walkTimeClaim(o: WayOption | null, mode: "walk" | "ride" | "transit", arriveAt: Date | null, timeZone: string | null): Claim {
  const topic = mode === "walk" ? "Walk time" : "Travel time";
  if (!o) return { id: "time", kind: "pending", topic, icon: "clock", claim: "Finding the way…" };
  const arrive = arriveAt ? ` · arrive about ${clockIn(arriveAt, timeZone)}` : "";
  const provider = o.route.provider === "google" ? "Google route" : o.route.provider === "osm" ? "OpenStreetMap route" : o.route.provider === "estimate" ? "Straight-line estimate" : "Mapped route";
  return { id: "time", kind: "estimate", topic, icon: "clock", claim: `About ${Math.round(o.route.minutes)} min · ${(o.route.meters / 1000).toFixed(1)} km${arrive}`, source: o.route.approximate ? "Straight-line estimate — not a street route" : mode === "walk" ? `${provider} at an average walking pace` : `${provider} · no live traffic` };
}

/**
 * Released community notes — a row only when there are some. Publishing notes is off in this beta
 * (PUBLIC_AGGREGATE_RELEASES), so an empty list is the normal answer and the row is left out (`null`)
 * rather than advertising notes that can't appear. `"failed"`: the check didn't answer — said as
 * failed, never as "no notes" (audit L06-004).
 */
export function notesClaim(notes: CommunityNote[] | null | "failed", where = "on this way"): Claim | null {
  if (notes === "failed") return { id: "notes", kind: "failed", topic: "From people", icon: "community", claim: "Mira couldn’t check notes from people just now." };
  if (!notes?.length) return null;
  const latest = notes[0];
  return { id: "notes", kind: "people", topic: "From people", icon: "community", claim: `${plural(notes.length, "note")} ${where} · latest: “${latest.text}”`, source: `Several people agreed · week of ${latest.week} · ${latest.timeBand}` };
}

export function updatesClaim(answer: { evidence: EvidenceState<SafetyUpdatesData> } | null | "failed", where = "near there"): Claim {
  if (answer === null) return { id: "updates", kind: "pending", topic: "Local updates", icon: "info", claim: "Checking recent local reports…" };
  if (answer === "failed" || answer.evidence.state === "failed") return { id: "updates", kind: "failed", topic: "Local updates", icon: "info", claim: "Mira couldn’t check recent local reports just now." };
  if (!("data" in answer.evidence)) return { id: "updates", kind: "none", topic: "Local updates", icon: "info", claim: "Local news isn’t available for this area." };
  const d = answer.evidence.data;
  if (!d.updates.length) return { id: "updates", kind: "nodata", topic: "Local updates", icon: "info", claim: `No recent women-safety reports found ${where} in the past ${d.windowDays} days.`, source: answer.evidence.state === "partial" ? "Some sources couldn’t be checked" : "Official sources and news, as published" };
  const latest = d.updates[0];
  return { id: "updates", kind: "checked", topic: "Local updates", icon: "info", claim: `${plural(d.updates.length, "report")} ${where} in the past ${d.windowDays} days · latest: ${CATEGORY_LABEL[latest.category] ?? "report"}, ${ageLabel(latest.publishedAt).toLowerCase()}`, source: `${latest.publisher} and others, as published` };
}

/**
 * What Mira has no source for: the screen's one "can't see" line. Always shown, so the brief never
 * looks complete when it isn't; the rows above keep at most a qualifier word ("listed hours").
 */
export function blindSpotsClaim(mode: "walk" | "ride" | "transit" | "loop"): Claim {
  const extra = mode === "ride" ? "driver details, " : mode === "transit" ? "whether services run at your time, " : "";
  return { id: "blind", kind: "none", topic: "What Mira can’t see", icon: "eye", claim: `${extra}whether a Help Point is staffed, crowds, live incidents, or whether a light works tonight.`.replace(/^./, (c) => c.toUpperCase()), source: "Your own judgement comes first." };
}

/**
 * Hours words for one Help Point, fact first; never "staffed". Hours taken from a listing end in
 * "(listed)" — unless `listed: false`, for rows under a heading that already says "listed hours".
 */
export function hoursWords(h: HoursState, { listed = true }: { listed?: boolean } = {}): string {
  const q = listed ? " (listed)" : "";
  switch (h.kind) {
    case "open_24h": return `open 24 hours${q}`;
    case "open_now": return "open now";
    case "listed_open": return `open until ${clock12(h.closesAt)}${q}`;
    case "closing": return `closes ${clock12(h.closesAt)}${q}`;
    case "closed": return `closed${h.listed ? q : ""}`;
    case "listed": return "hours unclear";
    default: return "hours not known";
  }
}
