// Deliberately not "server-only": scripts/mira-eval.ts runs this engine against stubbed tools.
// It holds no secret (the API key or client is passed in) and is only imported by server code.
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { CATEGORIES } from "@/domain/report/taxonomy";
import { emergencyLine, emergencySentence, noNumberReason, type CountryContext } from "@/domain/country-context";
import { contextLine } from "@/domain/context";
import { allowedNumbers, circleSharingLine, companionOutputIssue, type CompanionOutputIssue } from "@/domain/companion-output";
import { MIRA_PERSONA } from "./persona";
import { clock12 } from "./clock";
import { DANGER, verdictWords } from "./signals";
import type { MiraNow, MiraTools, SafetyUpdatesResult } from "./tools";
import type { MiraCard, MiraEvent, MiraTripMode, MiraTurn } from "./types";

/**
 * Mira on Claude. A manual streaming tool loop. Each round's text is buffered and checked by
 * the deterministic output guard (domain/companion-output) before any of it reaches the chat,
 * so text arrives per round, not token by token. Tools produce the same tap-to-confirm cards as the placeholder engine, so the UI is
 * unchanged. AI decides relevance, not truth: every fact comes from a tool result or the
 * context block. Privacy: Claude never sees coordinates — places are names, walking
 * minutes and opaque refs ("p1", "h1"); the server maps refs back to positions. Anything
 * location-derived is scrubbed from the text that gets saved to history.
 */

/**
 * Default model: Claude Sonnet 5.5 (owner decision 2026-10-04; Sonnet 5's successor at the same price — see docs/MIRA_EVAL.md).
 * Adaptive thinking at low effort (no `thinking` field; the levels are recalibrated from Sonnet 5, so re-run the eval
 * before changing effort). Operators can switch with MIRA_MODEL without a deploy.
 */
export const DEFAULT_MIRA_MODEL = "claude-sonnet-5-5";
const MAX_ROUNDS = 4; // tool round-trips per message (each costs latency)

export const TOOL_GUIDE = `How you work in the MIRA app:
- The context block tells you her local time and day, the area and country, the local emergency number (or that MIRA doesn't know it), her saved places, her Circle, any journey running, and what MIRA's data covers there. Use it; don't ask for things you already know. It is the only thing you know about where she is.
- Call a tool only when it directly helps with what she just asked. A greeting or "what time is it?" needs no tool — except late at night, when offering the journey home (propose_trip) is kind.
- Offer actions through tools; the app shows them as cards she taps. Never say a trip started, a report was sent, a link was shared, or that you called, told, alerted, emailed or set up anything — you only propose, and she taps. Never promise that anyone will be told or will see her. Plain text only (no markdown).
- Getting somewhere: when she says she's going home or to a saved place, call propose_trip straight away (don't ask first), with a saved place label or a place_ref from find_nearby / find_help_points, and a mode if she said how she's going (walk; ride for a taxi or app cab; transit for a train, metro or bus). For ride or transit you only propose; the Home screen plans it. Say what happens with her Circle as propose_trip's circle_sharing describes it, in your own words (email can be off or fail; never say they "will follow live").
- "Share this trip with my people" / "send my link": no tool sends anything. If a journey is running, call check_trip — its card opens the Trip screen, where "Send my live link" and "Tell my people now" are; say she can send it from there. If none is running, offer propose_trip.
- "What's open nearby", pharmacies, food, toilets, ATMs, a hotel for tonight, fuel, a taxi rank: find_nearby. Hours are as the map lists them and can be out of date (say so once, not per place); call a place open only when open_now is "open". Near her destination or a saved place ("a pharmacy near where I'm going"): find_nearby with near "destination" (her running journey's destination, or saved_place); never answer a destination question with places around her.
- "Somewhere staffed", "somewhere with people", a Help Point, or she feels uneasy: find_help_points (situation "unsafe" when she's uneasy, "nearby" otherwise). Help Points are places where help is usually available (hospital, police, station, pharmacy, hotel reception, fuel); say their hours exactly as the tool gives them.
- Uneasy or uncomfortable (not in immediate danger): don't ask a question first. Call find_help_points with situation "unsafe" and, if she has a saved home, propose_trip to it. Then one short, warm line. The app's "I feel unsafe" button shows the nearest Help Point and Emergency instantly; you can mention it.
- Followed, threatened, attacked or in danger: call show_emergency_help first (and find_help_points with situation "emergency" if her location is on), then keep it to one or two practical lines: the local emergency number from the context, or that MIRA doesn't know it and the Emergency button explains what to dial.
- "What's the emergency number / police number here?": get_local_emergency_info, then say the numbers exactly as it returns them — every service, not just the first — or that MIRA doesn't know them. For another country ("in Japan"): get_local_emergency_info with that country.
- Travel planning ("I'm landing in London at 11 PM"): be genuinely useful — general know-how for a late arrival (official taxi rank or an app cab rather than touts, keep your phone charged, share your ride), plus what you can do once she's there (Help Points and open places, sharing her journey, the local emergency number via get_local_emergency_info). Don't state specifics you weren't given as fact: schedules, prices, last trains or how an area is.
- Her plan (the context block says whether one is open): "how long is it", "will it be dark", "which way", "is my plan ok": check_plan, then a sentence or two in your own words — the main way's minutes, daylight at departure, and what isn't verified. With no plan open but she says where she's going, ask the one thing that's missing (where she's starting, or when) — one friendly question, not a form.
- Anything else she asks — how MIRA works, what something means, small talk, a general question, how her day is going: answer plainly and briefly in your own voice, no tool needed. If it's about a specific place, route, hour, number or person that no tool or the context gives you, say you don't know rather than guess.
- She tells you she's arrived or is home with a journey running: only "I'm here" on the journey screen ends it — say so, and call check_trip so the card is there.
- "Recent safety updates", "what's been happening in this city", news: get_safety_updates (where "here", or "destination" for her running journey's destination). They are news reports, not a verdict: tell her what was reported — quote a headline or two exactly as written, each with its publisher and how many days ago (and its reporting note for an allegation, arrest or charge: an arrest is not a conviction), and how many there are in all. Never reword a headline into your own claim or generalise from them ("this area is unsafe", "a lot happens here"); "couldnt_check" means MIRA couldn't check (never say "none"); zero updates proves nothing about an area. The full list is under Local updates in Around.
- "What do we know about this walk / route?" with a journey running: check_trip, then say its destination and ETA; lighting and Help Points along the way are on the route sheet (the card opens it).
- If she needs to move, say "somewhere with people around" or "somewhere open and lit", never "somewhere safe". No sign-offs like "stay safe" or "safe trip".
- Questions MIRA has no verified data for — is an area, street, city, route, taxi or transport safe or dangerous, crime, "should I avoid…": say in one short clause, in her language, that you can't judge that, then offer factual context from tools: Help Points near her and their hours (find_help_points), lighting mapped along a route if she proposes one (propose_trip after dark gives it), the local emergency number, sharing her journey. Never label anything safe, unsafe or dangerous; never estimate risk; never cite crime or statistics.
- propose_trip may return "known_about_the_way" (lighting, Help Points on the route). These are the only facts you have about the way; mention the one or two that matter in plain words (the card has the sources).
- Something happened to her, or she wants to report something: offer_report (category "other" when it's unclear), so she can report it privately (only ever shared as combined, anonymous notes).
- No saved home and she wants to go home: suggest_saving_home.
- She asks for routes or a way to go (even "safe routes", any time of day or night): never say you can't suggest routes. MIRA compares mapped ways for a walk or run — their minutes, the lighting mapped along each, daylight at that time, Help Points and places open then — and you recommend the one you'd take, with those reasons. She can share the journey too. If a plan is open, check_plan; otherwise ask the one thing you need (where she starts, and where she's going unless it's a loop back) or propose_trip to a saved place. Late at night, also mention places that are open then and sharing her run with her Circle.
- Never output coordinates, and don't guess addresses, hours, numbers or facts the tools and context didn't give you.`;

const REPORT_CATEGORIES = [...CATEGORIES] as unknown as [string, ...string[]];
const KINDS = ["pharmacy", "health", "police", "metro", "bus", "food", "shop", "toilets", "finance", "accommodation", "fuel", "taxi"] as const;
const MODES = ["walk", "ride", "transit"] as const;
const SITUATIONS = ["nearby", "unsafe", "emergency"] as const;
const NEAR = ["me", "destination"] as const;
const WHERE = ["here", "destination"] as const;

export const TOOLS: Anthropic.Tool[] = [
  {
    name: "find_nearby",
    description: "Find ordinary places (pharmacies, metro, cafés, toilets, ATMs) near her right now, or near her destination. Shows a list she can tap to go to. Returns names, kinds, distance from the point searched, listed hours, open_now (open / closed / not_known, from listed hours only) and a place_ref for propose_trip.",
    input_schema: {
      type: "object",
      properties: {
        kinds: { type: "array", items: { type: "string", enum: [...KINDS] }, description: "Kinds to look for; omit for anything." },
        near: { type: "string", enum: [...NEAR], description: '"destination": around her running journey\'s destination (or saved_place when given). Default "me".' },
        saved_place: { type: "string", description: 'With near "destination": a saved place label to search around instead.' },
      },
    },
    eager_input_streaming: true,
  },
  {
    name: "get_safety_updates",
    description: "Recent Safety updates for a whole city: news reports about women's safety (the same as Local updates in Around), for where she is or her running journey's destination. Returns the count, categories, and up to 5 of the latest with their headline as published, publisher, age and category, or that MIRA couldn't check. Reported context only — never a verdict on an area.",
    input_schema: { type: "object", properties: { where: { type: "string", enum: [...WHERE], description: 'Default "here".' } } },
    eager_input_streaming: true,
  },
  {
    name: "find_help_points",
    description: "Find Help Points near her now: places where help is usually available (hospital, police station, staffed station, pharmacy, hotel reception, fuel station), ranked by MIRA's fixed rules. Returns class, estimated walking minutes, hours state (open now / listed / not known), source and a place_ref for propose_trip. Shows them as a card she can tap.",
    input_schema: {
      type: "object",
      properties: { situation: { type: "string", enum: [...SITUATIONS], description: '"unsafe" when she is uneasy, "emergency" when she may be in danger, otherwise "nearby".' } },
    },
    eager_input_streaming: true,
  },
  {
    name: "get_local_emergency_info",
    description: "The emergency numbers and helplines MIRA knows, from reviewed, cited country profiles: for the country she is in, or for a country she names (\"in Japan\", travel planning). Every number comes with its service (police, ambulance, fire). Or that MIRA doesn't know them. For where she is, also shows the Emergency card.",
    input_schema: { type: "object", properties: { country: { type: "string", description: "A country she named, when she asks about somewhere other than where she is. Omit for where she is." } } },
    eager_input_streaming: true,
  },
  {
    name: "propose_trip",
    description: "Propose sharing a journey to a destination with her Circle. Shows a card; nothing starts until she taps it. Give exactly one of saved_place (a label from her saved places) or place_ref (from find_nearby or find_help_points). For walking it returns the walking minutes and, after dark, what's known about the way.",
    input_schema: {
      type: "object",
      properties: { saved_place: { type: "string" }, place_ref: { type: "string" }, mode: { type: "string", enum: [...MODES], description: "How she's going; default walk." } },
    },
    eager_input_streaming: true,
  },
  {
    name: "check_trip",
    description: "Check her current journey (destination, mode, ETA, state). Shows a status card if one is running.",
    input_schema: { type: "object", properties: {} },
    eager_input_streaming: true,
  },
  {
    name: "offer_report",
    description: "Offer to let her report something privately. Shows a card that opens the report form preset to this category.",
    input_schema: {
      type: "object",
      properties: { category: { type: "string", enum: REPORT_CATEGORIES }, label: { type: "string", description: "Short human label, e.g. 'being followed'" } },
      required: ["category", "label"],
    },
    eager_input_streaming: true,
  },
  {
    name: "show_emergency_help",
    description: "Show the Emergency card: a button that dials the local emergency number when MIRA knows it (and explains what to dial when it doesn't), plus sharing her journey with her Circle. Use first whenever she may be in danger.",
    input_schema: { type: "object", properties: {} },
    eager_input_streaming: true,
  },
  {
    name: "check_plan",
    description: "Check the plan she has open in the Plan screen (from the context block): mapped walking ways with minutes and km, calculated daylight at her departure time, sources, and what isn't verified. Shows the plan card she can open. Only when a plan is open.",
    input_schema: { type: "object", properties: {} },
    eager_input_streaming: true,
  },
  {
    name: "suggest_saving_home",
    description: "Show a button to save her home, so sharing the journey home is one tap next time.",
    input_schema: { type: "object", properties: {} },
    eager_input_streaming: true,
  },
];

const inputs = {
  find_nearby: z.object({ kinds: z.array(z.enum(KINDS)).max(5).optional(), near: z.enum(NEAR).optional(), saved_place: z.string().max(80).optional() }).strict(),
  get_safety_updates: z.object({ where: z.enum(WHERE).optional() }).strict(),
  find_help_points: z.object({ situation: z.enum(SITUATIONS).optional() }).strict(),
  get_local_emergency_info: z.object({ country: z.string().trim().min(2).max(80).optional() }).strict(),
  propose_trip: z.object({ saved_place: z.string().max(80).optional(), place_ref: z.string().max(10).optional(), mode: z.enum(MODES).optional() }).strict(),
  check_trip: z.object({}).strict(),
  offer_report: z.object({ category: z.enum(REPORT_CATEGORIES), label: z.string().trim().min(1).max(60) }).strict(),
  show_emergency_help: z.object({}).strict(),
  suggest_saving_home: z.object({}).strict(),
  check_plan: z.object({}).strict(),
};

export { DANGER };

/** The subset of the SDK client Mira uses (tests and the eval inject their own). */
export type MiraClient = Pick<Anthropic, "messages">;

let client: Anthropic | null = null;
function anthropic(apiKey: string): MiraClient {
  // A slow model falls back to the scripted Mira (index.ts) instead of leaving her waiting.
  client ??= new Anthropic({ apiKey, timeout: 20_000, maxRetries: 1 });
  return client;
}

function toMessages(history: MiraTurn[], message: string): Anthropic.MessageParam[] {
  // Alternate strictly user/assistant, starting with a user turn.
  const out: Anthropic.MessageParam[] = [];
  for (const t of [...history, { role: "user" as const, text: message }]) {
    const text = t.text.trim();
    if (!text) continue;
    const last = out[out.length - 1];
    if (last && last.role === t.role) last.content = `${last.content as string}\n\n${text}`;
    else out.push({ role: t.role, content: text });
  }
  while (out.length && out[0].role !== "user") out.shift();
  return out;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** History must not become a location log: drop area names, nearby place names and walking times. */
export function scrubForHistory(text: string, sensitive: string[], area: string | null): string {
  let out = text;
  const areaName = area?.replace(/^Near /, "") ?? "";
  if (areaName.length >= 3) out = out.replace(new RegExp(escapeRe(areaName), "gi"), "your area");
  for (const s of [...new Set(sensitive.filter((x) => x && x.length >= 3 && x !== area))].sort((a, b) => b.length - a.length)) {
    out = out.replace(new RegExp(escapeRe(s), "gi"), "a nearby place");
  }
  return out
    .replace(/\b(?:about\s+)?an?\s+\d+\s?(?:-|–)?\s?(?:min|minute)s?\s+walk\b/gi, "a short walk")
    .replace(/\b\d+(\.\d+)?\s?(km|m|metres|meters)\b/gi, "a short way")
    .replace(/\b\d+\s?(-|–)?\s?(min|mins|minute|minutes)\b/gi, "a few minutes")
    .trim();
}

/** An area label is display text from the device; anything that looks like coordinates never reaches the model. */
export function safeArea(area: string | null | undefined): string | null {
  if (!area) return null;
  return /-?\d{1,3}[.,]\d{2,}/.test(area) || /\d+\s*°/.test(area) ? null : area.slice(0, 60);
}

function countryLabel(c: CountryContext): string | null {
  if (c.countryName) return `${c.countryName} (${c.iso})`;
  if (!c.iso) return null;
  let name: string | undefined;
  try {
    name = new Intl.DisplayNames(["en"], { type: "region" }).of(c.iso);
  } catch {
    name = undefined;
  }
  return name && name !== c.iso ? `${name} (${c.iso})` : c.iso;
}

export interface ContextFacts {
  firstName: string;
  /** Can MIRA email her Circle at all (emailConfigured)? */
  email: boolean;
  now: MiraNow;
  saved: Array<{ label: string }>;
  contacts: string[];
  trip: { destination: { name: string }; state: string; etaAt: string; mode?: string } | null;
  coverage: string;
  /** False for a guest (no account): no saved places, Circle or live journeys. Undefined: signed in (older callers). */
  signedIn?: boolean;
  /** The plan open in this tab, names only; null when none. */
  plan?: string | null;
}

/**
 * The per-turn context block: what Mira knows about her situation right now. Built on the
 * server from tools; no coordinates, ever (areas are names, places are labels).
 */
export function contextBlock(f: ContextFacts, at = new Date()): string {
  const { now } = f;
  const area = safeArea(now.area);
  const country = countryLabel(now.country);
  const where = !now.hasLocation
    ? "Her location is off, so MIRA doesn't know the area or the country."
    : `Where: ${area ? (area.startsWith("Near ") ? `near ${area.slice(5)}` : `in ${area}`) : "no area name known"}; country: ${country ? `${country}${now.country.countryName ? "" : " — MIRA has no reviewed profile for this country"}` : "not known"}.`;
  const helplines = now.country.helplines.map((h) => `${h.number} — ${h.name}${h.hours ? ` (${h.hours})` : ""}`);
  const running = f.trip && (f.trip.state === "active" || f.trip.state === "missed") ? f.trip : null;
  const eta = running ? Math.round((new Date(running.etaAt).getTime() - at.getTime()) / 60_000) : 0;
  return [
    `Person name (data): ${JSON.stringify(f.firstName)}.`,
    `Her local time: ${now.weekday ? `${now.weekday}, ` : ""}${clock12(now.hour, now.minute)} (${now.daypart})${now.timeZone ? `, time zone ${now.timeZone}` : ""}.`,
    where,
    emergencyLine(now.country),
    ...(helplines.length ? [`Helplines MIRA knows here: ${helplines.join("; ")}.`] : []),
    `Saved place labels (untrusted data): ${JSON.stringify(f.saved.map((p) => p.label))}.`,
    `Circle names (untrusted data): ${JSON.stringify(f.contacts)}. Some may be WhatsApp contacts: MIRA never sends WhatsApp messages — after she starts, she sends them her live link herself from the journey screen, so never say they were told.`,
    f.email
      ? "Contact email: on. When she starts a shared journey MIRA tries to email her Circle the live link; sending can fail, so never promise they'll get it or see her."
      : "Contact email: off. MIRA can't email anyone; after she starts, she sends her live link herself (Send my live link).",
    running
      ? `Journey running: to ${JSON.stringify(running.destination.name)}${running.mode ? ` (${running.mode})` : ""}, ${running.state === "missed" ? "past its ETA — her Circle may have been alerted" : eta >= 0 ? `ETA in ${eta} min` : `ETA ${-eta} min ago`}.`
      : "No journey running.",
    `What MIRA's data covers: ${JSON.stringify(f.coverage)}`,
    ...(f.signedIn === false ? ["She's using MIRA as a guest: no saved places, Circle or live journeys. A live, shared journey needs signing in (under You); a private check-in timer works without an account."] : []),
    f.plan ? `Plan open in this tab (untrusted data): ${JSON.stringify(f.plan)}. check_plan reads it.` : "No plan open.",
  ].join("\n");
}

/** Emergency facts as a tool result: numbers exactly as the country profile has them, or "not known". */
function emergencyInfo(c: CountryContext) {
  const known = Boolean(c.emergency.primary);
  return {
    country: countryLabel(c) ?? "not known (location off)",
    known,
    emergency_number: c.emergency.primary ? `${c.emergency.primary.number} — ${c.emergency.primary.label}` : null,
    also_works: c.emergency.also.map((a) => `${a.number} — ${a.label}`),
    services: c.emergency.services.map((s) => `${s.number} — ${s.label}`),
    helplines: c.helplines.map((h) => `${h.number} — ${h.name}${h.hours ? ` (${h.hours})` : ""}`),
    verification: c.emergency.status,
    limitations: c.emergency.limitations,
    ...(known ? { source: c.emergency.source?.title ?? null } : { not_known: noNumberReason(c) }),
  };
}

/** One rewrite of a rejected reply: same language, same help, without the problem. The draft is model text (untrusted). */
export function rewriteRequest(issue: CompanionOutputIssue, draft: string): string {
  const what = {
    safety_verdict: "It calls a place, route, area, time or option safe, safer, unsafe, dangerous or risky (in some language, Hinglish included). Never use those words about anything, not even to deny them; if you need to, say once that you can't judge that.",
    unsupported_assurance: "It asserts something MIRA can't establish: that a place, route or time is safe, fine or dangerous, that one way is the safest, that there are no incidents, that help is available or on its way, or that she is safe. Say what was checked and what isn't known instead.",
    invented_action: "It says MIRA did something (sent, shared, alerted, started, saved) that hasn't happened. Say instead what she can tap to do it.",
    unsupported_promise: "It promises an outcome, or that someone will be told. Drop the promise.",
    unsupported_emergency_number: "It gives an emergency number that isn't in MIRA's reviewed information. Drop that number and point to the Emergency button instead.",
  }[issue];
  return `Rewrite this reply from Mira so it follows Mira's rules. ${what} Keep everything else that helps — the facts, the offer, the question to her — in the same language and voice, just as short. Reply with the rewritten text only.\n\n<draft>\n${draft.slice(0, 4000)}\n</draft>`;
}

/**
 * What she sees instead of a rejected model reply, built only from the Country Context. In a
 * danger turn it always carries the emergency sentence, so rejecting text never loses the number.
 */
export function replacementLine(issue: CompanionOutputIssue, country: CountryContext, danger: boolean): string {
  if (danger) return `If you may be in danger, ${emergencySentence(country)}. The Emergency card is on your screen.`;
  if (issue === "safety_verdict" || issue === "unsupported_assurance") return "I don't have enough verified information to make that judgement. The cards here show what MIRA can check.";
  return "I can't verify that from MIRA's information. Please use the cards shown here for actions and checked details.";
}

export interface ClaudeMiraOptions {
  message: string;
  history: MiraTurn[];
  tools: MiraTools;
  firstName: string;
  model?: string;
  /** Either a key (the shared SDK client) or an injected client (tests, eval). */
  apiKey?: string;
  client?: MiraClient;
}

export async function* claudeMira(opts: ClaudeMiraOptions): AsyncGenerator<MiraEvent> {
  const { tools, firstName } = opts;
  const model = opts.model ?? DEFAULT_MIRA_MODEL;
  const cards: MiraCard[] = [];
  const hasSos = () => cards.some((c) => c.type === "sos");

  // Emergency never waits on the model: danger words surface the Emergency card first.
  const contacts = await tools.trustedContacts();
  if (DANGER.test(opts.message)) {
    const card: MiraCard = { type: "sos", contacts };
    cards.push(card);
    yield { type: "card", card };
  }

  const [ctx, saved, trip] = await Promise.all([tools.getContext(), tools.listSavedPlaces(), tools.tripStatus()]);
  const context = contextBlock({ firstName, email: tools.emailOn(), now: ctx, saved, contacts, trip, coverage: tools.coverage(), signedIn: tools.signedIn?.() ?? true, plan: tools.planSummary?.() ?? null }); // stubbed tools (tests, eval) may omit these

  const allowed = allowedNumbers(ctx.country);
  const refs = new Map<string, { name: string; lat: number; lon: number }>();
  let lookedAround = false; // a place list ran: the reply describes what's around her
  const sensitive: string[] = [];
  let spoken = "";
  const messages = toMessages(opts.history, opts.message);
  const api = opts.client ?? anthropic(opts.apiKey ?? "");
  const effort = /haiku/.test(model) ? {} : { output_config: { effort: "low" as const } }; // a quick companion reply, not deep research

  async function runTool(name: string, raw: unknown): Promise<{ result: unknown; card?: MiraCard; error?: string }> {
    const schema = inputs[name as keyof typeof inputs];
    if (!schema) return { result: null, error: `Unknown tool ${name}` };
    const parsed = schema.safeParse(raw ?? {});
    if (!parsed.success) return { result: null, error: `Invalid input: ${parsed.error.issues.map((i) => i.message).join("; ")}` };
    const input = parsed.data as Record<string, unknown>;
    switch (name) {
      case "find_nearby": {
        let around: { name: string; lat: number; lon: number } | undefined;
        if (input.near === "destination") {
          const label = typeof input.saved_place === "string" ? input.saved_place.toLowerCase() : null;
          const place = label ? saved.find((p) => p.label.toLowerCase() === label) : undefined;
          const t = place ? null : await tools.tripStatus();
          around = place ? { name: place.label, lat: place.lat, lon: place.lon } : t && (t.state === "active" || t.state === "missed") ? t.destination : undefined;
          if (!around) return { result: { error: "No journey is running and no saved place matched, so MIRA has no destination to search around. Ask where she means; don't offer places around her instead." } };
        } else if (!ctx.hasLocation) return { result: { error: "Location is off, so I can't look around her." } };
        const found = await tools.findNearby(input.kinds as string[] | undefined, around);
        lookedAround = true;
        if (around) sensitive.push(around.name);
        const list = found.map((p) => {
          const ref = `p${refs.size + 1}`;
          refs.set(ref, { name: p.name, lat: p.lat, lon: p.lon });
          sensitive.push(p.name);
          return { place_ref: ref, name: p.name, kind: p.kind, distance_m: p.distanceM ?? null, listed_hours: p.hours ?? "hours not known", open_now: p.openNow };
        });
        const card: MiraCard | undefined = found.length ? { type: "places", title: around ? `Near ${around.name}` : "Close by", places: found.map((p) => ({ name: p.name, kind: p.kind, distanceM: p.distanceM, lat: p.lat, lon: p.lon })) } : undefined;
        return {
          result: list.length
            ? { searched_around: around ? `her destination (${around.name}), not where she is` : "where she is", places: list, note: 'Hours are as the map lists them; they can be out of date. Say open only when open_now is "open".' }
            : { none: "The map lookup returned no such places. That doesn't prove there are none; say so." },
          card,
        };
      }
      case "find_help_points": {
        if (!ctx.hasLocation) return { result: { error: "Location is off, so MIRA can't look for Help Points around her. The app's Emergency button still works." } };
        const situation = (input.situation as (typeof SITUATIONS)[number] | undefined) ?? "nearby";
        const { points: found, failed } = await tools.findHelpPoints(situation);
        lookedAround = true;
        if (failed) return { result: { lookup_failed: "MIRA couldn't check Help Points just now (the map lookup failed). Say you couldn't check — never that there are none. The Emergency button still works." } };
        const list = found.map((p) => {
          const ref = `h${refs.size + 1}`;
          refs.set(ref, { name: p.name, lat: p.lat, lon: p.lon });
          sensitive.push(p.name);
          return { place_ref: ref, name: p.name, class: p.label, walk_minutes_estimate: p.minutes, hours: p.hours, source: p.source };
        });
        const card: MiraCard | undefined = found.length ? { type: "help_points", title: situation === "nearby" ? "Help Points near you" : "Nearest Help Points", points: found } : undefined;
        return {
          result: list.length
            ? { help_points: list, note: "Ranked by MIRA's fixed rules (walking time, staffed around the clock first). Staffing is what's usual for the class, not a promise about this place. Say hours exactly as given." }
            : { none: "MIRA has no Help Point results to show from this lookup. Do not infer that none exist nearby." },
          card,
        };
      }
      case "get_local_emergency_info": {
        if (typeof input.country === "string") {
          const named = tools.emergencyFor?.(input.country) ?? null;
          if (!named) return { result: { not_known: `MIRA has no reviewed profile for "${input.country}". Say so; don't give a number.` } };
          return { result: { ...emergencyInfo(named), note: "For the country she named, not where she is now. Say every number with its service exactly as listed (e.g. police 110 and ambulance/fire 119) — never just the first." } };
        }
        const card: MiraCard | undefined = hasSos() ? undefined : { type: "sos", contacts };
        return { result: { ...emergencyInfo(ctx.country), note: "The Emergency card is on her screen now." }, card };
      }
      case "get_safety_updates": {
        const r: SafetyUpdatesResult = await tools.safetyUpdates((input.where as (typeof WHERE)[number] | undefined) ?? "here");
        if ((r.status === "checked" || r.status === "couldnt_check") && r.area) sensitive.push(r.area);
        const note =
          r.status === "checked"
            ? "News reports as published, for the whole city: quote a headline exactly, with its publisher and age; never a verdict, rating or comparison, and zero updates proves nothing. The list and sources are in Official & news updates on Today."
            : r.status === "couldnt_check"
              ? "MIRA couldn't check Safety updates just now. Say that; never say there are none."
              : r.status === "off"
                ? "Safety updates are switched off in this deployment."
                : "Say this plainly.";
        return { result: { ...r, note } };
      }
      case "propose_trip": {
        const savedPlace = typeof input.saved_place === "string" ? saved.find((p) => p.label.toLowerCase() === (input.saved_place as string).toLowerCase()) : undefined;
        const ref = typeof input.place_ref === "string" ? refs.get(input.place_ref) : undefined;
        const dest = savedPlace ? { name: savedPlace.label, lat: savedPlace.lat, lon: savedPlace.lon, savedPlaceId: savedPlace.id } : ref ? { name: ref.name, lat: ref.lat, lon: ref.lon } : null;
        if (!dest) return { result: { error: "Unknown destination. Use a saved place label or a place_ref from find_nearby / find_help_points." } };
        const mode = (input.mode as MiraTripMode | undefined) ?? "walk";
        const { context: known, ...t } = await tools.proposeTrip(dest, mode);
        return {
          result: {
            destination: dest.name,
            mode,
            ...(mode === "walk" ? { walk_minutes: t.minutes } : { note_mode: "MIRA doesn't estimate rides or transit here: Home plans it and asks her for the ETA." }),
            circle: t.contacts,
            circle_sharing: circleSharingLine(t.contacts, t.email, t.whatsapp) || "Nobody in her Circle yet: the journey stays private unless she sends her live link.",
            ...(t.helpLookupFailed ? { help_points_on_route: "MIRA couldn't check Help Points along the way (the lookup failed): say not known, never none." } : {}),
            ...(known.length
              ? {
                  known_about_the_way: known.map((c) => ({ line: contextLine(c), source: c.source.name, confidence: c.confidence, not_known: c.unknowns })),
                  context_note: "These are the only facts you have about the way. Pick at most one or two that matter to her now, keep the source and what isn't known, and never call a route or place safe or unsafe.",
                }
              : {}),
            note: "Shown as a card; nothing starts until she taps it.",
          },
          card: { type: "trip", destination: t.destination, minutes: t.minutes, contacts: t.contacts, mode, email: t.email, whatsapp: t.whatsapp },
        };
      }
      case "check_trip": {
        const t = await tools.tripStatus();
        if (!t || (t.state !== "active" && t.state !== "missed")) return { result: { trip: "none running" } };
        const minutesLeft = Math.round((new Date(t.etaAt).getTime() - Date.now()) / 60_000);
        return {
          result: {
            destination: t.destination.name,
            mode: t.mode,
            state: t.state,
            minutes_until_eta: minutesLeft,
            route_details: "Lighting and Help Points along the way are on the route sheet (the card opens the Trip screen); MIRA hasn't re-checked them here.",
            sharing: '"Send my live link" and "Tell my people now" are on the Trip screen; nothing is sent from this chat.',
          },
          card: { type: "trip_status", destination: t.destination.name, etaAt: t.etaAt, state: t.state },
        };
      }
      case "offer_report":
        return { result: { shown: true }, card: { type: "report", category: input.category as string, label: input.label as string } };
      case "show_emergency_help":
        return { result: { shown: "The Emergency card is on her screen now.", emergency: emergencyLine(ctx.country), circle: contacts }, card: hasSos() ? undefined : { type: "sos", contacts } };
      case "suggest_saving_home":
        return { result: { shown: true }, card: { type: "save_place" } };
      case "check_plan": {
        const checked = tools.checkPlan ? await tools.checkPlan() : null;
        if (!checked) return { result: { error: "No plan is open. Ask where she's starting and going, or suggest Plan (Where are you going? on Home)." } };
        return {
          result: { ...checked.facts, note: "If ways_compared is there, recommend one: say which way you'd take and the checked reasons (more of it mapped as lit, Help Points or places listed open on it, shorter), then the daylight at departure and what isn't known (map tags don't say whether lamps work tonight; how busy a street is isn't known). Recommend, never guarantee: don't call any way safe or safer. Otherwise say the main way's minutes and the daylight in a sentence or two." },
          card: checked.card,
        };
      }
    }
    return { result: null, error: `Unhandled tool ${name}` };
  }

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const stream = api.messages.stream({
      model,
      max_tokens: 2048,
      ...effort,
      system: [
        { type: "text", text: `${MIRA_PERSONA}\n\n${TOOL_GUIDE}`, cache_control: { type: "ephemeral" } },
        { type: "text", text: `Context right now:\n${context}` },
      ],
      tools: TOOLS,
      messages,
    });
    let roundText = "";
    for await (const ev of stream) {
      if (ev.type === "content_block_delta" && ev.delta.type === "text_delta" && ev.delta.text) roundText += ev.delta.text;
    }
    // The round alone, then the whole reply so far (a claim can straddle rounds; earlier rounds already passed).
    const NO_VERDICT_FILTER = { checkVerdicts: false };
    const issue = roundText ? (companionOutputIssue(roundText, allowed, NO_VERDICT_FILTER) ?? companionOutputIssue(spoken + roundText, allowed, NO_VERDICT_FILTER)) : null;
    if (issue) {
      const danger = hasSos() || DANGER.test(opts.message);
      // Outside danger, ask for one rewrite that keeps the help and drops the problem: throwing the whole answer away for
      // a single word left her with a canned line and nothing useful (owner report 2026-10-04, a Hinglish "safe routes" ask).
      let fixed: string | null = null;
      if (!danger) {
        try {
          const r = await api.messages.stream({ model, max_tokens: 1024, ...effort, system: [{ type: "text", text: MIRA_PERSONA }], messages: [{ role: "user", content: rewriteRequest(issue, roundText) }] }).finalMessage();
          const text = r.content.map((c) => (c.type === "text" ? c.text : "")).join("").trim();
          const u = r.usage;
          yield { type: "usage", inputTokens: (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + Math.ceil((u.cache_read_input_tokens ?? 0) / 10), outputTokens: u.output_tokens ?? 0 };
          if (text && !companionOutputIssue(text, allowed, NO_VERDICT_FILTER) && !companionOutputIssue(spoken + text, allowed, NO_VERDICT_FILTER)) fixed = text;
        } catch {
          fixed = null;
        }
      }
      console.warn(JSON.stringify({ t: new Date().toISOString(), src: "web", event: "mira.output_rejected", reason: issue, recovered: Boolean(fixed) }));
      roundText = fixed ?? replacementLine(issue, ctx.country, danger);
      if (danger && !hasSos()) {
        const card: MiraCard = { type: "sos", contacts };
        cards.push(card);
        yield { type: "card", card };
      }
    }
    if (roundText) { spoken += roundText; yield { type: "text", delta: roundText }; }
    const msg = await stream.finalMessage();
    const u = msg.usage;
    // Cache reads are billed at a tenth of input, so they count as a tenth (the cached persona + tools are ~3.4k tokens a call).
    yield { type: "usage", inputTokens: (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + Math.ceil((u.cache_read_input_tokens ?? 0) / 10), outputTokens: u.output_tokens ?? 0 };
    if (msg.stop_reason === "refusal") {
      if (!spoken.trim()) {
        const t = "I can't help with that one — but I'm here for getting you where you're going.";
        spoken += t;
        yield { type: "text", delta: t };
      }
      break;
    }
    const uses = msg.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    if (!uses.length || msg.stop_reason !== "tool_use") break; // end_turn (or max_tokens on plain text)
    messages.push({ role: "assistant", content: msg.content });
    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const u of uses) {
      const r = await runTool(u.name, u.input);
      if (r.card) {
        cards.push(r.card);
        yield { type: "card", card: r.card };
      }
      results.push({ type: "tool_result", tool_use_id: u.id, is_error: Boolean(r.error), content: JSON.stringify(r.error ? { error: r.error } : r.result) });
    }
    messages.push({ role: "user", content: results });
    if (spoken && !/\s$/.test(spoken)) {
      spoken += " ";
      yield { type: "text", delta: " " };
    }
  }

  // Measured, not blocked: how often a reply still contains a verdict word. Counts only, never the text.
  const verdicts = verdictWords(spoken);
  if (verdicts.length) console.info(JSON.stringify({ t: new Date().toISOString(), src: "web", event: "mira.verdict_word", model, words: verdicts }));

  // A reply describing what's around her can't be reliably scrubbed (the model paraphrases
  // names), so that turn is saved as a neutral line; other turns are scrubbed.
  yield { type: "history", text: lookedAround ? "I showed you places near you (not saved, for your privacy)." : scrubForHistory(spoken, sensitive, ctx.area) };
  yield { type: "done" };
}
