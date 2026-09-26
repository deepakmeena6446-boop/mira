// Deliberately not "server-only": scripts/mira-eval.ts runs this engine against stubbed tools.
// It holds no secret (the API key or client is passed in) and is only imported by server code.
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { CATEGORIES } from "@/domain/report/taxonomy";
import { GSM_EMERGENCY, emergencyLine, type CountryContext } from "@/domain/country-context";
import { contextLine } from "@/domain/context";
import { MIRA_PERSONA } from "./persona";
import { clock12 } from "./clock";
import { DANGER, verdictWords } from "./signals";
import type { MiraNow, MiraTools } from "./tools";
import type { MiraCard, MiraEvent, MiraTripMode, MiraTurn } from "./types";

/**
 * Mira on Claude. A manual streaming tool loop: text streams straight to the chat;
 * tools produce the same tap-to-confirm cards as the placeholder engine, so the UI is
 * unchanged. AI decides relevance, not truth: every fact comes from a tool result or the
 * context block. Privacy: Claude never sees coordinates — places are names, walking
 * minutes and opaque refs ("p1", "h1"); the server maps refs back to positions. Anything
 * location-derived is scrubbed from the text that gets saved to history.
 */

/** Default model (measured in docs/MIRA_EVAL.md). Operators can switch with MIRA_MODEL without a deploy. */
export const DEFAULT_MIRA_MODEL = "claude-sonnet-5";
const MAX_ROUNDS = 4; // tool round-trips per message (each costs latency)

export const TOOL_GUIDE = `How you work in the MIRA app:
- The context block tells you her local time and day, the area and country, the local emergency number (or that MIRA doesn't know it), her saved places, her Circle, any journey running, and what MIRA's data covers there. Use it; don't ask for things you already know. It is the only thing you know about where she is.
- Call a tool only when it directly helps with what she just asked. A greeting or "what time is it?" needs no tool — except late at night, when offering the journey home (propose_trip) is kind.
- Offer actions through tools; the app shows them as cards she taps. Never say a trip started, a report was sent, or that you called, alerted or set up anything — you only propose, and she taps. Plain text only (no markdown).
- Getting somewhere: when she says she's going home or to a saved place, call propose_trip straight away (don't ask first), with a saved place label or a place_ref from find_nearby / find_help_points, and a mode if she said how she's going (walk; ride for a taxi or app cab; transit for a train, metro or bus). For ride or transit you only propose; the Home screen plans it. Mention who in her Circle would follow along live.
- "What's open nearby", pharmacies, food, toilets, ATMs: find_nearby. Hours are as the map lists them and can be out of date — say "listed" hours.
- "Somewhere staffed", "somewhere with people", a Help Point, or she feels uneasy: find_help_points (situation "unsafe" when she's uneasy, "nearby" otherwise). Help Points are places where help is usually available (hospital, police, station, pharmacy, hotel reception, fuel); say their hours exactly as the tool gives them.
- Uneasy or uncomfortable (not in immediate danger): don't ask a question first. Call find_help_points with situation "unsafe" and, if she has a saved home, propose_trip to it. Then one short, warm line. The app's "I feel unsafe" button shows the nearest Help Point and Emergency instantly; you can mention it.
- Followed, threatened, attacked or in danger: call show_emergency_help first (and find_help_points with situation "emergency" if her location is on), then keep it to one or two practical lines: the local emergency number from the context, or that MIRA doesn't know it and the Emergency button explains what to dial.
- "What's the emergency number / police number here?": get_local_emergency_info, then say the number exactly as it returns it, or that MIRA doesn't know it.
- Travel planning ("I'm landing in London at 11 PM"): say what you can do from what you have — the local emergency number if MIRA knows it (from the context, or get_local_emergency_info if she's asking about somewhere else, which you only know when she's there), sharing her journey with her Circle, Help Points and open places once she's there. Don't invent airport, taxi, transit or area advice.
- Questions MIRA has no verified data for — is an area, street, city, route, taxi or transport safe or dangerous, crime, "should I avoid…": start with "I don't have enough verified information to make that judgement." (in her language), then offer factual context from tools: Help Points near her and their hours (find_help_points), lighting mapped along a route if she proposes one (propose_trip after dark gives it), the local emergency number, sharing her journey. Never label anything safe, unsafe or dangerous; never estimate risk; never cite crime or statistics.
- propose_trip may return "known_about_the_way" (lighting, Help Points on the route). These are the only facts you have about the way; mention at most one or two that matter, with the source and what isn't known.
- Something happened to her: offer_report, so she can report it privately (only ever shared as combined, anonymous notes).
- No saved home and she wants to go home: suggest_saving_home.
- Never output coordinates, and don't guess addresses, hours, numbers or facts the tools and context didn't give you.`;

const REPORT_CATEGORIES = CATEGORIES.filter((c) => c !== "other") as unknown as [string, ...string[]];
const KINDS = ["pharmacy", "health", "police", "metro", "bus", "food", "shop", "toilets", "finance"] as const;
const MODES = ["walk", "ride", "transit"] as const;
const SITUATIONS = ["nearby", "unsafe", "emergency"] as const;

export const TOOLS: Anthropic.Tool[] = [
  {
    name: "find_nearby",
    description: "Find ordinary places near her right now (pharmacies, metro, cafés, toilets, ATMs). Shows a list she can tap to go to. Returns names, kinds, walking distance, listed hours and a place_ref for propose_trip.",
    input_schema: { type: "object", properties: { kinds: { type: "array", items: { type: "string", enum: [...KINDS] }, description: "Kinds to look for; omit for anything around her." } } },
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
    description: "The emergency numbers and helplines MIRA knows for the country she is in (from reviewed, cited country profiles), or that MIRA doesn't know them there. Also shows the Emergency card.",
    input_schema: { type: "object", properties: {} },
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
    name: "suggest_saving_home",
    description: "Show a button to save her home, so sharing the journey home is one tap next time.",
    input_schema: { type: "object", properties: {} },
    eager_input_streaming: true,
  },
];

const inputs = {
  find_nearby: z.object({ kinds: z.array(z.enum(KINDS)).max(5).optional() }).strict(),
  find_help_points: z.object({ situation: z.enum(SITUATIONS).optional() }).strict(),
  get_local_emergency_info: z.object({}).strict(),
  propose_trip: z.object({ saved_place: z.string().max(80).optional(), place_ref: z.string().max(10).optional(), mode: z.enum(MODES).optional() }).strict(),
  check_trip: z.object({}).strict(),
  offer_report: z.object({ category: z.enum(REPORT_CATEGORIES), label: z.string().trim().min(1).max(60) }).strict(),
  show_emergency_help: z.object({}).strict(),
  suggest_saving_home: z.object({}).strict(),
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
  now: MiraNow;
  saved: Array<{ label: string }>;
  contacts: string[];
  trip: { destination: { name: string }; state: string; etaAt: string; mode?: string } | null;
  coverage: string;
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
    `Person: ${f.firstName}.`,
    `Her local time: ${now.weekday ? `${now.weekday}, ` : ""}${clock12(now.hour, now.minute)} (${now.daypart})${now.timeZone ? `, time zone ${now.timeZone}` : ""}.`,
    where,
    emergencyLine(now.country),
    ...(helplines.length ? [`Helplines MIRA knows here: ${helplines.join("; ")}.`] : []),
    `Saved places: ${f.saved.length ? f.saved.map((p) => p.label).join(", ") : "none yet"}.`,
    `Her Circle (would follow a shared journey): ${f.contacts.length ? f.contacts.join(", ") : "nobody yet"}.`,
    running
      ? `Journey running: to ${running.destination.name}${running.mode ? ` (${running.mode})` : ""}, ${running.state === "missed" ? "past its ETA — her Circle may have been alerted" : eta >= 0 ? `ETA in ${eta} min` : `ETA ${-eta} min ago`}.`
      : "No journey running.",
    `What MIRA's data covers: ${f.coverage}`,
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
    ...(known ? { source: c.emergency.source?.title ?? null } : { not_known: GSM_EMERGENCY.explain }),
  };
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
  const context = contextBlock({ firstName, now: ctx, saved, contacts, trip, coverage: tools.coverage() });

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
        if (!ctx.hasLocation) return { result: { error: "Location is off, so I can't look around her." } };
        const found = await tools.findNearby(input.kinds as string[] | undefined);
        lookedAround = true;
        const list = found.map((p) => {
          const ref = `p${refs.size + 1}`;
          refs.set(ref, { name: p.name, lat: p.lat, lon: p.lon });
          sensitive.push(p.name);
          return { place_ref: ref, name: p.name, kind: p.kind, walking_distance_m: p.distanceM ?? null, listed_hours: p.hours ?? "not listed" };
        });
        const card: MiraCard | undefined = found.length ? { type: "places", title: "Close by", places: found.map((p) => ({ name: p.name, kind: p.kind, distanceM: p.distanceM, lat: p.lat, lon: p.lon })) } : undefined;
        return { result: list.length ? { places: list, note: "Hours are as the map lists them; they can be out of date." } : { none: "No such places in the map data MIRA has for this area." }, card };
      }
      case "find_help_points": {
        if (!ctx.hasLocation) return { result: { error: "Location is off, so MIRA can't look for Help Points around her. The app's Emergency button still works." } };
        const situation = (input.situation as (typeof SITUATIONS)[number] | undefined) ?? "nearby";
        const found = await tools.findHelpPoints(situation);
        lookedAround = true;
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
            : { none: "No Help Points in the map data MIRA has within about 1.5 km." },
          card,
        };
      }
      case "get_local_emergency_info": {
        const card: MiraCard | undefined = hasSos() ? undefined : { type: "sos", contacts };
        return { result: { ...emergencyInfo(ctx.country), note: "The Emergency card is on her screen now." }, card };
      }
      case "propose_trip": {
        const savedPlace = typeof input.saved_place === "string" ? saved.find((p) => p.label.toLowerCase() === (input.saved_place as string).toLowerCase()) : undefined;
        const ref = typeof input.place_ref === "string" ? refs.get(input.place_ref) : undefined;
        const dest = savedPlace ? { name: savedPlace.label, lat: savedPlace.lat, lon: savedPlace.lon } : ref ? { name: ref.name, lat: ref.lat, lon: ref.lon } : null;
        if (!dest) return { result: { error: "Unknown destination. Use a saved place label or a place_ref from find_nearby / find_help_points." } };
        const mode = (input.mode as MiraTripMode | undefined) ?? "walk";
        const { context: known, ...t } = await tools.proposeTrip(dest, mode);
        return {
          result: {
            destination: dest.name,
            mode,
            ...(mode === "walk" ? { walk_minutes: t.minutes } : { note_mode: "MIRA doesn't estimate rides or transit here: Home plans it and asks her for the ETA." }),
            circle_who_would_follow: t.contacts,
            ...(known.length
              ? {
                  known_about_the_way: known.map((c) => ({ line: contextLine(c), source: c.source.name, confidence: c.confidence, not_known: c.unknowns })),
                  context_note: "These are the only facts you have about the way. Pick at most one or two that matter to her now, keep the source and what isn't known, and never call a route or place safe or unsafe.",
                }
              : {}),
            note: "Shown as a card; nothing starts until she taps it.",
          },
          card: { type: "trip", destination: t.destination, minutes: t.minutes, contacts: t.contacts, mode },
        };
      }
      case "check_trip": {
        const t = await tools.tripStatus();
        if (!t || (t.state !== "active" && t.state !== "missed")) return { result: { trip: "none running" } };
        const minutesLeft = Math.round((new Date(t.etaAt).getTime() - Date.now()) / 60_000);
        return { result: { destination: t.destination.name, mode: t.mode, state: t.state, minutes_until_eta: minutesLeft }, card: { type: "trip_status", destination: t.destination.name, etaAt: t.etaAt, state: t.state } };
      }
      case "offer_report":
        return { result: { shown: true }, card: { type: "report", category: input.category as string, label: input.label as string } };
      case "show_emergency_help":
        return { result: { shown: "The Emergency card is on her screen now.", emergency: emergencyLine(ctx.country), circle: contacts }, card: hasSos() ? undefined : { type: "sos", contacts } };
      case "suggest_saving_home":
        return { result: { shown: true }, card: { type: "save_place" } };
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
    for await (const ev of stream) {
      if (ev.type === "content_block_delta" && ev.delta.type === "text_delta" && ev.delta.text) {
        spoken += ev.delta.text;
        yield { type: "text", delta: ev.delta.text };
      }
    }
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
