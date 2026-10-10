/**
 * The companion's short answer (docs/sprints/mira-companion-48h/03 §B): a few relevant, qualified items
 * chosen from evidence the screen already has, with the rest left to the full "What Mira checked" detail.
 * Pure and deterministic — no model output decides what is true, and nothing is invented to fill a slot.
 */

/** How Mira knows an item. `failed` means the check didn't finish; `unknown` means no source covers it. */
export type BriefKind = "listed" | "community" | "calculation" | "estimate" | "unknown" | "failed";

export type BriefItem = {
  id: string;
  kind: BriefKind;
  text: string;
  sourceLabel?: string;
  sourceUrl?: string;
  /** Actual observation or event time, when the source supplies one. */
  observedAt?: string;
  /** When Mira retrieved it; never stands in for observedAt. */
  checkedAt?: string;
  /** What the item is about: "on this way", "near your start", "around Hauz Khas". */
  scopeLabel: string;
  /** The one qualification that belongs beside this claim. */
  limitation?: string;
};

/**
 * Why an item might matter, in selection order (03 §B):
 * 1 `asked` — the request or an explicit constraint she gave;
 * 2 `action` — what the chosen next action needs (travel time, a found or missing route);
 * 3 `timely` — material time-sensitive context (dark at that time, a current community observation);
 * 4 `secondary` — one useful further fact.
 */
export type BriefTier = "asked" | "action" | "timely" | "secondary";
export type BriefCandidate = BriefItem & { tier: BriefTier };

const ORDER: Record<BriefTier, number> = { asked: 0, action: 1, timely: 2, secondary: 3 };
export const BRIEF_LIMIT = 3;

/**
 * Pick at most three items: by tier, then — within a tier — a failed check before a decorative fact,
 * keeping the caller's order otherwise. Duplicates (same id or same text) are dropped. Everything not
 * chosen is returned as `rest` for the detail view. Fewer than three candidates means fewer items.
 */
export function selectBrief(candidates: BriefCandidate[], limit = BRIEF_LIMIT): { items: BriefItem[]; rest: BriefItem[] } {
  const seen = new Set<string>();
  const unique = candidates.filter((c) => {
    const key = c.text.trim().toLowerCase();
    if (seen.has(c.id) || seen.has(key)) return false;
    seen.add(c.id);
    seen.add(key);
    return true;
  });
  const ranked = unique.map((c, i) => ({ c, i })).sort((a, b) => ORDER[a.c.tier] - ORDER[b.c.tier] || Number(b.c.kind === "failed") - Number(a.c.kind === "failed") || a.i - b.i);
  const strip = ({ tier: _tier, ...item }: BriefCandidate): BriefItem => { void _tier; return item; };
  return { items: ranked.slice(0, Math.max(0, limit)).map(({ c }) => strip(c)), rest: ranked.slice(Math.max(0, limit)).map(({ c }) => strip(c)) };
}

/**
 * The one fact a plan's sky card leads with (design/mira-companion-ux). Fixed rules over items the brief already
 * holds — no model, nothing new — so the same evidence always leads the same way:
 * 1. a failed route check: what to do next depends on it, and it's said once, beside its retry;
 * 2. on foot, the calculated sky when it's dark or twilight as she starts, or turns before she's due to finish
 *    (`skyMatters`) — it changes how the way will be, where the minutes don't;
 * 3. a released note from people about the way: current, corroborated, and about this way;
 * 4. otherwise the travel-time estimate — the honest fallback, as before.
 * Null when there's no time to give: a missing route stays in the list as "not known". Whatever doesn't lead keeps
 * its place, and its qualifier, in the list.
 */
export function chooseTakeaway(items: BriefItem[], signals: { onFoot: boolean; skyMatters: boolean }): BriefItem | null {
  const time = items.find((i) => (i.id === "time" || i.id === "route") && i.kind !== "unknown") ?? null;
  if (time?.kind === "failed") return time;
  if (signals.onFoot && signals.skyMatters) {
    const sky = items.find((i) => (i.id === "daylight" || i.id === "daylight-end") && i.kind === "calculation");
    if (sky) return sky;
  }
  return items.find((i) => i.kind === "community") ?? time;
}

/** A lead item as a headline and the rest of its sentence: "Dark when you set off" · "daylight from about 6:34 AM". */
export function splitLead(text: string): { head: string; rest: string | null } {
  const at = text.indexOf(" · ");
  return at < 0 ? { head: text, rest: null } : { head: text.slice(0, at), rest: text.slice(at + 3) };
}

/** Plain labels for the qualifier shown beside each item (never a verdict). */
export const BRIEF_KIND_LABEL: Record<BriefKind, string> = {
  listed: "Listed",
  community: "From people",
  calculation: "Calculated",
  estimate: "Estimate",
  unknown: "Not known",
  failed: "Couldn’t check",
};

/**
 * The one limitation line under the items. A failed check is named (it limits what she can rely on);
 * otherwise, when no community information came back, that absence is said plainly — never as "no
 * reports" or reassurance. Returns null when neither applies.
 */
export function briefLimitation(input: { failed: string[]; community: "some" | "none" | "failed" | "pending" }): string | null {
  const failed = [...new Set(input.failed.filter(Boolean))];
  if (input.community === "failed" && !failed.includes("community information")) failed.push("community information");
  if (failed.length) return `I couldn’t check ${listWords(failed)} just now.`;
  if (input.community === "none") return "I don’t have current community information for this place.";
  return null;
}

/** "a", "a and b", "a, b and c". */
export function listWords(list: string[]): string {
  return list.length <= 2 ? list.join(" and ") : `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`;
}

/**
 * The service caveat for a route at a planned time. Mira's route check has no departure time, so a
 * transit or ride estimate never establishes service or traffic at her time (03 §B, 02 evening return).
 */
export function routeTimeLimitation(mode: "walk" | "ride" | "transit", clock: string | null): string | null {
  if (mode === "transit") return `This is a route estimate; I haven’t verified services${clock ? ` at ${clock}` : " at your time"}.`;
  if (mode === "ride") return "A route estimate without live traffic or driver availability.";
  return null;
}
