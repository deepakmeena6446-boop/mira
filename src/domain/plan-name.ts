import { instantForLocal, localTimeForInstant } from "./plan-options";
import type { PlanDraft } from "./plan-state";

/**
 * One name for a plan everywhere it appears (Plan's heading, Mira's plan strip, Home, Journeys), so a
 * person always knows which plan Mira means. Derived from the plan itself — never a model's summary.
 */
export function placeName(p: PlanDraft["origin"] | PlanDraft["destination"]): string | null {
  if ("kind" in p && p.kind === "device") return "Where you are";
  return p.resolution ? p.resolution.name : p.query.trim() || null;
}

export function loopWord(draft: Pick<PlanDraft, "activity">): "Run" | "Walk" {
  return /\bwalk/i.test(draft.activity) && !/\brun/i.test(draft.activity) ? "Walk" : "Run";
}

export function planTitle(draft: PlanDraft): string {
  if (draft.loop) return `${loopWord(draft)} · ${draft.loopTarget?.kind === "duration" ? draft.loopTarget.value : 30} min`;
  const to = placeName(draft.destination);
  if (to) return `To ${to}`;
  return draft.activity.trim() || "A plan in progress";
}

/** "Now", "Today, 9:00 PM", "Tomorrow, 5:00 AM" or "Sat 4 Oct, 9:00 PM" — in the plan's own zone. */
export function whenWords(local: string, zone: string, now = new Date()): string {
  if (!local) return "";
  const today = localTimeForInstant(now, zone);
  const [d, t] = local.split("T");
  const [h, m] = t.split(":").map(Number);
  const time = `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
  const diff = Math.round((Date.parse(`${d}T00:00:00Z`) - Date.parse(`${today.split("T")[0]}T00:00:00Z`)) / 86_400_000);
  const nowMin = Number(today.slice(11, 13)) * 60 + Number(today.slice(14, 16));
  if (diff === 0 && Math.abs(h * 60 + m - nowMin) <= 5) return "Now";
  if (diff === 0) return `Today, ${time}`;
  if (diff === 1) return `Tomorrow, ${time}`;
  if (diff === -1) return `Yesterday, ${time}`;
  const date = new Date(`${d}T12:00:00Z`).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
  return `${date}, ${time}`;
}

/** The plan's one-line detail: when first (what matters most), then where it starts. */
export function planLine(draft: PlanDraft, now = new Date()): string {
  const origin = placeName(draft.origin);
  const from = origin === "Where you are" ? "from where you are" : origin ? `from ${origin}` : null;
  const when = draft.departureLocal && draft.timeZone ? whenWords(draft.departureLocal, draft.timeZone, now) : "";
  return [when, from].filter(Boolean).join(" · ") || "Still being planned";
}

/** When the plan starts, as an instant (null while the time is incomplete) — for ordering plans. */
export function planStartsAt(draft: PlanDraft): number | null {
  return draft.departureLocal && draft.timeZone ? instantForLocal(draft.departureLocal, draft.timeZone)?.getTime() ?? null : null;
}
