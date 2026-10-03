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
  // TODO(human): decide when a lighting / Help Point difference between ways is worth saying, and how.
  void ways;
  void selected;
  return null;
}

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
    out.push(input.helpAt ? `${way.helpPoints.length} Help Point${way.helpPoints.length === 1 ? " is" : "s are"} on this way; ${open} ${open === 1 ? "is" : "are"} listed open then.` : `${way.helpPoints.length} Help Point${way.helpPoints.length === 1 ? " is" : "s are"} on this way.`);
  }
  return out;
}
