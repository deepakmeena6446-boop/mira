/**
 * "Mira's take" (docs/phase1-ux/01 §1): one to three deterministic sentences at the top of a brief.
 * Templates over evidence only — never model output, never a verdict word (safe, safer, unsafe,
 * dangerous, well-lit, deserted). A difference is stated only when the evidence supports it.
 */
import type { WayOption } from "./brief";
import { hoursState, type HelpPoint } from "@/domain/help-points";
import type { LocalTime } from "@/domain/opening-hours";
import type { DaylightState } from "@/domain/daylight";

/**
 * Compare the chosen way with the others, in one sentence — or say nothing.
 *
 * Inputs are the ways in provider order (index 0 is the fastest) and the index she has selected.
 * Each way has `route.minutes`, `lighting.summary` (lit / poles / dark / unknown, 0–100 shares of its
 * length; null when no lighting evidence) and `helpPoints` along it.
 *
 * Return null when there is nothing worth saying (one way only, no lighting evidence, or differences
 * too small to matter). Never rank ways overall, and never use a verdict word.
 */
export function compareWays(ways: WayOption[], selected: number): string | null {
  const mine = ways[selected];
  const myLit = mappedLighting(mine);
  if (myLit === null) return null;
  // Against the fastest way; when this is the fastest, against the way that differs most.
  const others = selected === 0 ? ways.map((w, i) => ({ w, i })).filter(({ i }) => i !== 0) : [{ w: ways[0], i: 0 }];
  let best: { w: WayOption; lit: number } | null = null;
  for (const { w } of others) {
    const lit = mappedLighting(w);
    if (lit === null || Math.abs(lit - myLit) < LIGHTING_GAP) continue;
    if (!best || Math.abs(lit - myLit) > Math.abs(best.lit - myLit)) best = { w, lit };
  }
  if (!best) return null;
  const name = selected !== 0 ? "the fastest way" : ways.length === 2 ? "the other way" : "another way";
  const short = selected !== 0 ? "fastest" : ways.length === 2 ? "the other way" : "that way";
  const dm = Math.round(mine.route.minutes) - Math.round(best.w.route.minutes);
  const time = dm === 0 ? "It takes about the same time" : `It takes ${Math.abs(dm)} min ${dm > 0 ? "longer" : "less"}`;
  const a = mine.helpPoints.length;
  const b = best.w.helpPoints.length;
  const help = Math.abs(a - b) >= HELP_GAP ? ` and passes ${a} Help Point${a === 1 ? "" : "s"} (${short}: ${b})` : "";
  return `This way has lighting mapped along about ${about(myLit)}% of it; ${name}, about ${about(best.lit)}%. ${time}${help}.`;
}

/** Owner decisions (2026-10-04): gaps under 20 points are noise in old map data; 2+ Help Points is a real difference. */
const LIGHTING_GAP = 20;
const HELP_GAP = 2;
const MAX_UNKNOWN = 50;

/** Share of a way with lighting mapped (lit + streetlights), or null when the evidence is too thin to compare. */
function mappedLighting(w: WayOption | undefined): number | null {
  if (!w || w.route.approximate || !w.lighting) return null;
  const s = w.lighting.summary;
  if (s.lit + s.poles + s.dark === 0 || s.unknown > MAX_UNKNOWN) return null;
  return s.lit + s.poles;
}

/** Map shares are years old: "about 70%", never "72%". */
const about = (pct: number) => Math.round(pct / 5) * 5;

const listedOpen = (p: HelpPoint, at: LocalTime | null) => {
  const h = hoursState(p, at ?? undefined);
  return h.kind === "open_24h" || h.kind === "listed_open" || h.kind === "open_now";
};

/** The full take for a brief: daylight first, then the way comparison, then Help Points at that time. */
export function decisionTake(input: {
  departDaylight: DaylightState | null;
  arriveDaylight: DaylightState | null;
  ways: WayOption[];
  selected: number;
  helpAt: LocalTime | null;
  loop: boolean;
  /** Ride/transit Help Points are the ones near where she arrives, not along the way. */
  mode?: "walk" | "ride" | "transit";
  /** A run or walk loop: Help Points within a short walk of the start. */
  nearStart?: HelpPoint[];
}): string[] {
  const out: string[] = [];
  const { departDaylight: d0, arriveDaylight: d1 } = input;
  if (d0 === "dark" && d1 === "dark") out.push(input.loop ? "It will be dark for the whole of this." : "It will be dark when you set off and when you arrive.");
  else if (d0 === "daylight" && d1 && d1 !== "daylight") out.push("It will still be light when you set off, but getting dark before you arrive.");
  else if (d0 && d0 !== "daylight" && d1 === "daylight") out.push("It will be getting light as you go.");
  else if (d0 === "uncertain") out.push("You’d set off in twilight.");
  else if (d0 === "daylight") out.push("It will be daylight.");
  const compare = compareWays(input.ways, input.selected);
  if (compare) out.push(compare);
  const way = input.ways[input.selected];
  if (way?.helpPoints.length) {
    const open = way.helpPoints.filter((p) => listedOpen(p, input.helpAt)).length;
    const where = input.mode && input.mode !== "walk" ? "near where you arrive" : "on this way";
    const n = way.helpPoints.length;
    out.push(`${n} Help Point${n === 1 ? " is" : "s are"} ${where}${input.helpAt ? `; ${open} ${open === 1 ? "is" : "are"} listed open then` : ""}.`);
  }
  if (input.loop && input.nearStart?.length) {
    const n = input.nearStart.length;
    const open = input.nearStart.filter((p) => listedOpen(p, input.helpAt)).length;
    out.push(input.helpAt ? `Of ${n} Help Point${n === 1 ? "" : "s"} near your start, ${open} ${open === 1 ? "is" : "are"} listed open when you start.` : `${n} Help Point${n === 1 ? " is" : "s are"} near your start.`);
  }
  return out;
}
