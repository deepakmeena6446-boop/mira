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
import { aboutIn, clockIn, daylightOutlook } from "@/domain/daylight";
import { lightingEvidenceLine, sourceList } from "@/components/app/LightingSummary";
import { CATEGORY_LABEL, ageLabel, type SafetyUpdatesData } from "@/domain/safety-updates";
import type { EvidenceKind } from "@/components/mira/Evidence";
import { briefLimitation, listWords, routeTimeLimitation, selectBrief, type BriefCandidate, type BriefItem } from "@/domain/companion-brief";

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
/**
 * Whether the place's own clock is known. A chosen place's zone is looked up; until it answers ("checking") or when
 * it can't ("unknown"), no clock time is said in another zone (the phone's or her country's) — a change is said
 * relative to now instead, and listed opening hours aren't read.
 */
export type PlaceClock = "known" | "checking" | "unknown";

export function daylightClaim(at: Date | null, point: { lat: number; lon: number } | null, timeZone: string | null, label = "at that time", clock: PlaceClock = "known"): Claim {
  if (!at || !point) return { id: "daylight", kind: "none", topic: "Daylight", icon: "sun", claim: "Not calculated yet — choose a place and a time." };
  const outlook = daylightOutlook(at, point);
  if (!outlook) return { id: "daylight", kind: "none", topic: "Daylight", icon: "sun", claim: "Mira doesn’t calculate daylight this far north or south." };
  const state = daylightAt(at, point);
  const to = outlook.changeTo === "daylight" ? "daylight" : state === "dark" && outlook.changeTo === "uncertain" ? "twilight" : outlook.changeTo === "dark" ? "dark" : null;
  const change = !outlook.changeAt ? "" : clock === "known" ? ` · ${to ? `${to} from` : "changes"} about ${clockIn(outlook.changeAt, timeZone)}` : ` · ${to ?? "changes"} ${aboutIn(at, outlook.changeAt)}`;
  const words = state === "daylight" ? `Daylight ${label}` : state === "dark" ? `Dark ${label}` : `Twilight ${label}`;
  const source = clock === "known" ? "Solar calculation" : `Solar calculation · from now, not a clock time: ${clock === "checking" ? "checking this place’s local time" : "this place’s local time isn’t known"}`;
  return { id: "daylight", kind: "checked", topic: "Daylight", icon: "sun", claim: `${words}${change}`, source };
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
export function helpClaim(points: HelpPoint[], evidence: EvidenceState<HelpPoint[]> | undefined, at: LocalTime | null, where = "on this way", atLabel = "then", clock: PlaceClock = "known"): Claim {
  if (!evidence) return { id: "help", kind: "pending", topic: "Help Points", icon: "shield", claim: "Looking for Help Points…" };
  if (evidence.state === "failed") return { id: "help", kind: "failed", topic: "Help Points", icon: "shield", claim: "Mira couldn’t check Help Points just now." };
  if (evidence.state === "unavailable") return { id: "help", kind: "none", topic: "Help Points", icon: "shield", claim: "Help Point sources aren’t available here." };
  if (!points.length) return { id: "help", kind: "nodata", topic: "Help Points", icon: "shield", claim: `None found ${where} in the sources checked.` };
  const states = points.map((p) => hoursState(p, at ?? undefined));
  const open = states.filter((h) => h.kind === "open_24h" || h.kind === "listed_open" || h.kind === "open_now").length;
  const closed = states.filter((h) => h.kind === "closed").length;
  const kinds = [...new Set(points.map((p) => HELP_CLASSES[p.cls].label.toLowerCase()))].slice(0, 3).join(", ");
  const timePart = at ? ` · ${open} open ${atLabel}${closed ? `, ${closed} closed` : ""}` : clock === "checking" ? " · opening hours wait for this place’s local time" : clock === "unknown" ? " · opening hours not checked: this place’s local time isn’t known" : "";
  const sources = [...new Set(points.map((p) => SOURCE_SHORT[p.hoursSource ?? p.source]))].join(" + ");
  return { id: "help", kind: "checked", topic: "Help Points", icon: "shield", claim: `${plural(points.length, "Help Point")} ${where} (${kinds})${timePart}`, source: `${sources} · listed hours${evidence.state === "partial" ? " · some sources couldn’t be checked" : ""}` };
}

export function walkTimeClaim(o: WayOption | null, mode: "walk" | "ride" | "transit", arriveAt: Date | null, timeZone: string | null): Claim {
  const topic = mode === "walk" ? "Walk time" : "Travel time";
  if (!o) return { id: "time", kind: "pending", topic, icon: "clock", claim: "Finding the way…" };
  const arrive = arriveAt ? ` · arrive about ${clockIn(arriveAt, timeZone)}` : "";
  const provider = o.route.provider === "google" ? "Google route" : o.route.provider === "osm" ? "OpenStreetMap route" : o.route.provider === "estimate" ? "Straight-line estimate" : "Mapped route";
  return { id: "time", kind: "estimate", topic, icon: "clock", claim: `About ${Math.round(o.route.minutes)} min · ${(o.route.meters / 1000).toFixed(1)} km${arrive}`, source: o.route.approximate ? "Straight-line estimate — not a street route" : mode === "walk" ? `${provider} at an average walking pace` : mode === "transit" ? `${provider} · not checked against timetables for your time` : `${provider} · no live traffic` };
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
  if (!d.updates.length) return { id: "updates", kind: "nodata", topic: "Local updates", icon: "info", claim: `Mira’s news sources returned nothing indexed for this area in the past ${d.windowDays} days. That isn’t a sign of what happens there.`, source: answer.evidence.state === "partial" ? "Some sources couldn’t be checked" : "Official sources and news, as published" };
  const latest = d.updates[0];
  // publishedAt is when the index first saw the story, not when it happened; the area is as the story reports it.
  return { id: "updates", kind: "checked", topic: "Local updates", icon: "info", claim: `${plural(d.updates.length, "report")} indexed for this area in the past ${d.windowDays} days · latest: ${CATEGORY_LABEL[latest.category] ?? "report"}, first indexed ${ageLabel(latest.publishedAt).toLowerCase()}`, source: `${latest.publisher} and others, as published · location as reported, not checked against this ${where === "near there" ? "place" : "spot"}` };
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

/**
 * The short answer for a brief (sprint 03 §B): the screen's claims ranked into at most three items, plus
 * one limitation line. Local news never enters the short answer (03 §C: nothing in the current data
 * establishes present, route-specific relevance); it stays in the detail. Unknowns stay in the detail
 * too, except a missing route — the next action depends on it. Pending checks are left out until done.
 */
export function planBrief(claims: Claim[], ctx: { mode: "walk" | "ride" | "transit"; loop: boolean; arriveClock?: string | null; departClock?: string | null; constraints?: string; compare?: string | null; notesPending?: boolean }): { items: BriefItem[]; limitation: string | null } {
  const candidates: BriefCandidate[] = [];
  const failed: string[] = [];
  let community: "some" | "none" | "failed" | "pending" = ctx.notesPending ? "pending" : "none";
  const constraint = (ctx.constraints ?? "").split(",").map((c) => c.trim()).filter(Boolean).slice(0, 3);
  if (constraint.length) candidates.push({ id: "asked", tier: "asked", kind: "unknown", text: `You asked about ${listWords(constraint.map((c) => `“${c}”`))}. Mira has no source for that here, so this plan doesn’t account for it.`, scopeLabel: "your request" });
  const dark = claims.some((c) => (c.id === "daylight" || c.id === "daylight-end") && /^(Dark|Twilight)|dark from|twilight from/.test(c.claim));
  for (const c of claims) {
    if (c.kind === "pending") { if (c.id === "notes") community = "pending"; continue; }
    switch (c.id) {
      case "route":
      case "time":
        candidates.push({ id: c.id, tier: "action", kind: c.kind === "failed" ? "failed" : c.kind === "estimate" ? "estimate" : "unknown", text: c.claim, sourceLabel: c.source, scopeLabel: ctx.loop ? "your loop" : "this way", limitation: c.kind === "estimate" ? routeTimeLimitation(ctx.mode, ctx.departClock ?? null) ?? undefined : undefined });
        break;
      case "daylight":
      case "daylight-end":
        if (c.kind === "checked") candidates.push({ id: c.id, tier: ctx.loop || dark ? "timely" : "secondary", kind: "calculation", text: c.claim, sourceLabel: "Solar calculation, not weather or visibility", scopeLabel: "at that time" });
        break;
      case "notes":
        if (c.kind === "failed") community = "failed";
        else if (c.kind === "people") { community = "some"; candidates.push({ id: c.id, tier: "timely", kind: "community", text: c.claim, sourceLabel: c.source, scopeLabel: "nearby" }); }
        break;
      case "lighting":
        if (c.kind === "failed") failed.push("street lighting");
        else if (c.kind === "checked" || c.kind === "people") candidates.push({ id: c.id, tier: dark && ctx.mode === "walk" ? "timely" : "secondary", kind: c.kind === "people" ? "community" : "listed", text: c.claim, sourceLabel: c.source, scopeLabel: "this way", limitation: "Mapped lighting, not whether the lamps work tonight." });
        break;
      case "help":
        if (c.kind === "failed") failed.push("Help Points");
        else if (c.kind === "checked") candidates.push({ id: c.id, tier: "secondary", kind: "listed", text: c.claim, sourceLabel: c.source, scopeLabel: "nearby", limitation: "A listing isn’t a promise that someone will help; staffing isn’t verified." });
        break;
      case "country":
        candidates.push({ id: c.id, tier: "timely", kind: c.kind === "checked" ? "listed" : "unknown", text: `${c.topic}: ${c.claim}`, sourceLabel: c.source, scopeLabel: "where you arrive" });
        break;
      default:
        break; // local updates and "what Mira can't see" live in the detail
    }
  }
  if (ctx.compare) candidates.push({ id: "compare", tier: "secondary", kind: "estimate", text: ctx.compare, sourceLabel: "Mapped lighting and listed Help Points on each way", scopeLabel: "ways to compare" });
  const { items } = selectBrief(candidates);
  return { items, limitation: briefLimitation({ failed, community }) };
}
