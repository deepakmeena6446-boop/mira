import type { EvidenceState } from "@/domain/evidence-state";
import type { RouteLighting } from "@/domain/lighting";

/**
 * The Mira line (docs/launch-ux/07 §A.2): one calm, deterministic sentence that turns evidence
 * Mira already fetched into a conclusion and (at most) one next action. Pure: no I/O, no model.
 * It never states whether anything is safe — every template is checked against the companion
 * output guard in tests/unit/mira-line.test.ts.
 */

export type PulseState = "observing" | "thinking" | "noticed" | "attention" | "with-you";
export type UsageMode = "cold" | "journey" | "contribute" | "mixed";

export type MiraLineAction =
  | { kind: "go-habit"; label: string }
  | { kind: "take-home"; label: string }
  | { kind: "answer-check"; label: string }
  | { kind: "see-impact"; label: string }
  | { kind: "scout"; label: string }
  | { kind: "find-home"; label: string }
  | { kind: "add-circle"; label: string };

export interface MiraLine {
  /** Stable id of the fact shown: a change of key (not of wording) is what counts as "noticed". */
  key: string;
  text: string;
  state: PulseState;
  action?: MiraLineAction;
  /** Why Mira is suggesting this (shown on request). */
  why?: string;
}

export interface HomeLineInput {
  signedIn: boolean;
  /** "Good evening, Asha" — no emoji. */
  greeting: string;
  firstName: string | null;
  /** Late evening or night on her clock (the existing greetingFor().late). */
  late: boolean;
  night: boolean;
  hasLocation: boolean;
  habit: { placeLabel: string; mode: string; times: number } | null;
  home: { label: string } | null;
  readyCheck: string | null;
  newlyVerified: boolean;
  scoutNew: boolean;
  circleCount: number;
  journeysStarted: number;
  usage: UsageMode;
}

const HABIT_VERB: Record<string, string> = { walk: "walk", ride: "go by cab", transit: "take transit" };

/** Home's Mira line: first matching rule wins; the usage mode reorders only the adaptive rows. */
export function homeLine(i: HomeLineInput): MiraLine {
  const rows: Record<string, () => MiraLine | null> = {
    scout: () =>
      i.scoutNew
        ? { key: "scout", text: "You're a Mira Scout. Others keep confirming what you tell Mira.", state: "noticed", action: { kind: "scout", label: "What this means" }, why: "Your answers have been confirmed by others over time, in different places." }
        : null,
    check: () =>
      i.readyCheck
        ? { key: `check:${i.readyCheck}`, text: `One quick question about ${i.readyCheck} from your walk.`, state: "noticed", action: { kind: "answer-check", label: "Answer" }, why: "You passed it on your last journey. Mira asks one question at most, and only if it helps others." }
        : null,
    habit: () =>
      i.habit && i.hasLocation
        ? {
            key: `habit:${i.habit.placeLabel}:${i.habit.mode}`,
            text: `Heading to ${i.habit.placeLabel}? You usually ${HABIT_VERB[i.habit.mode] ?? "go"} there around this time.`,
            state: "noticed",
            action: { kind: "go-habit", label: "Go with Mira" },
            why: `You've arrived at ${i.habit.placeLabel} around this hour ${i.habit.times} times. You can see or clear this in Me → What Mira remembers.`,
          }
        : null,
    home: () =>
      i.late && i.home && i.hasLocation
        ? { key: "late-home", text: `Heading home${i.firstName ? `, ${i.firstName}` : ""}?`, state: "observing", action: { kind: "take-home", label: i.home.label === "Home" ? "Take me home" : `Take me to ${i.home.label}` } }
        : null,
    verified: () =>
      i.newlyVerified
        ? { key: "verified", text: "Someone else confirmed what you told Mira.", state: "noticed", action: { kind: "see-impact", label: "See impact" }, why: "Someone else independently said the same thing, so it now counts." }
        : null,
  };
  // After dark, the way home outranks contribution for everyone; by day a contributor sees her question first.
  const adaptive = !(i.night || i.late) && i.usage === "contribute" ? ["check", "verified", "habit", "home"] : ["habit", "home", "check", "verified"];
  if (!i.signedIn) {
    return { key: "signed-out", text: "Search anywhere to see the way, its lighting and the Help Points on it. No account needed.", state: "observing" };
  }
  for (const name of ["scout", ...adaptive]) {
    const line = rows[name]();
    if (line) return line;
  }
  if (!i.home) return { key: "find-home", text: "Save Home once, and the walk back is one tap.", state: "observing", action: { kind: "find-home", label: "Find it" } };
  if (i.circleCount === 0 && i.journeysStarted >= 1)
    return { key: "add-circle", text: "Add someone who should know you got there.", state: "observing", action: { kind: "add-circle", label: "Add someone" } };
  return { key: "default", text: `${i.greeting}. Where to?`, state: "observing" };
}

export interface RouteLineInput {
  loading: boolean;
  minutes: number | null;
  approximate: boolean;
  /** "11:00 pm" on her clock, when known. */
  arriveAt: string | null;
  failed: boolean;
  tooFar: boolean;
  lighting: RouteLighting | null;
  lightingEvidence?: EvidenceState<RouteLighting>;
  helpCount: number;
  helpFirstMinutes: number | null;
  helpState?: EvidenceState<unknown>["state"];
  /** Names who'll be able to follow, as last time (from the existing tripStartExtras default). */
  likeLastTime?: string | null;
}

const minutesText = (m: number) => (m >= 90 ? `${Math.round((m / 60) * 10) / 10} h` : `${m} min`);

/** The lighting clause: a share of the way, never a verdict; unknown ≠ failed ≠ unavailable. */
export function lightingClause(l: RouteLighting | null, e?: EvidenceState<RouteLighting>): string {
  if (e?.state === "failed") return "Couldn't check lighting right now.";
  if (e?.state === "unavailable") return "Lighting evidence isn't available for this way.";
  const s = l?.summary;
  const known = s ? s.lit + s.poles + s.dark : 0;
  if (!s || known === 0) return "Lighting on this way isn't mapped.";
  if (s.unknown >= 80) return "Most of it isn't mapped for lighting.";
  const lit = s.lit + s.poles;
  if (lit >= 66) return "Most of it is mapped as lit.";
  if (lit >= 33) return "About half is mapped as lit.";
  return "Little of it is mapped as lit.";
}

function helpClause(i: RouteLineInput): string {
  if (i.helpState === "failed") return "Couldn't check Help Points.";
  if (i.helpState === "unavailable") return "";
  if (!i.helpCount) return "No Help Points found on the way.";
  const first = i.helpFirstMinutes !== null ? `, the first ${i.helpFirstMinutes < 1 ? "right at the start" : `${i.helpFirstMinutes} min in`}` : "";
  return `${i.helpCount} Help Point${i.helpCount === 1 ? "" : "s"} on the way${first}.`;
}

/** The route sheet's summary for a walk (rides and transit keep their own time line). */
export function routeLine(i: RouteLineInput): MiraLine {
  if (i.loading) return { key: "route:loading", text: "Finding the way…", state: "thinking" };
  if (i.tooFar) return { key: "route:too-far", text: "Too far to walk. Choose how you're going.", state: "observing" };
  if (i.failed || i.minutes === null) return { key: "route:failed", text: "Couldn't get the walking time. You can still go with Mira.", state: "observing" };
  if (i.approximate)
    return { key: "route:approx", text: `About ${minutesText(i.minutes)} in a straight line. There's no street map here, so lighting and Help Points aren't known.`, state: "observing" };
  const head = `${minutesText(i.minutes)} walk${i.arriveAt ? `, arrive around ${i.arriveAt}` : ""}.`;
  const tail = i.likeLastTime ? `Like last time, ${i.likeLastTime} will be able to follow.` : "";
  const text = [head, lightingClause(i.lighting, i.lightingEvidence), helpClause(i), tail].filter(Boolean).join(" ");
  return { key: `route:${i.minutes}:${lightingClause(i.lighting, i.lightingEvidence)}:${i.helpCount}`, text, state: "noticed" };
}

export interface TripLineInput {
  autoArrival: boolean;
  /** Contacts whose link went out (email) — they can see her now. */
  following: string[];
  /** WhatsApp contacts on this journey (a tap she makes). */
  whatsapp: string[];
  attention: boolean;
}

const names = (list: string[]) => (list.length <= 2 ? list.join(" and ") : `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`);

/** The journey sheet's status sentence: who can see her, until when. Never implies more than is true. */
export function tripLine(i: TripLineInput): MiraLine {
  const until = i.autoArrival ? "until you arrive" : "until you stop sharing";
  const state: PulseState = i.attention ? "attention" : "with-you";
  if (i.following.length) return { key: "trip:following", text: `${names(i.following)} can see where you are ${until}.`, state };
  if (i.whatsapp.length) return { key: "trip:whatsapp", text: `Send ${names(i.whatsapp)} your live link, and they can follow ${until}.`, state };
  return { key: "trip:private", text: `Only people you send your live link to can follow.`, state };
}
