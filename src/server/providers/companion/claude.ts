import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { CATEGORIES } from "@/domain/report/taxonomy";
import { MIRA_PERSONA } from "./persona";
import type { MiraTools } from "./tools";
import type { MiraCard, MiraEvent, MiraTurn } from "./types";

/**
 * Mira on Claude. A manual streaming tool loop: text streams straight to the chat;
 * tools produce the same tap-to-confirm cards as the placeholder engine, so the UI is
 * unchanged. Privacy: Claude never sees coordinates — places are names, distances and
 * opaque refs ("p1"); the server maps refs back to positions. Anything location-derived
 * is scrubbed from the text that gets saved to history.
 */

export const MIRA_MODEL = "claude-opus-5";
const MAX_ROUNDS = 4; // tool round-trips per message (each costs latency)

const TOOL_GUIDE = `How you work in the MIRA app:
- The context block tells you the time, the person's area, their saved places and trusted contacts. Use it; don't ask for things you already know.
- Call a tool only when it directly helps with what they just asked. A greeting or "what time is it?" needs no tool — except late at night, when offering the walk home (propose_trip) is kind.
- Offer actions through tools; the app shows them as cards the person taps. Never say a trip started or a report was sent — you only propose.
- To help someone get somewhere, call propose_trip with a saved place label or a place_ref from find_nearby. Mention who would follow along live.
- For "what's open / near me" questions, call find_nearby with fitting kinds. Opening hours from map data can be out of date — say so briefly.
- If someone mentions being followed, threatened, attacked or in danger, call show_emergency_help first, then keep it short and practical.
- If they feel uneasy, unsure or uncomfortable (not in immediate danger): don't ask a question first. Call find_nearby with kinds [police, health, metro, pharmacy] and, if they have a saved home, propose_trip to it. Then one short, warm line. The app also has an "I feel unsafe" button with the nearest Help Point and Emergency; you can mention it.
- If someone describes something that happened, you can call offer_report so they can report it privately (reviewed by a person; only shared as combined, anonymous notes).
- If they have no saved home and want to go home, call suggest_saving_home.
- Never output coordinates, and don't guess addresses or facts the tools didn't give you.`;

const REPORT_CATEGORIES = CATEGORIES.filter((c) => c !== "other") as unknown as [string, ...string[]];
const KINDS = ["pharmacy", "health", "police", "metro", "bus", "food", "shop", "toilets", "finance"] as const;

const TOOLS: Anthropic.Tool[] = [
  {
    name: "find_nearby",
    description: "Find places near the person right now (e.g. pharmacies, metro, cafés). Shows them a list they can tap to walk to. Returns names, kinds, walking distance and a place_ref for propose_trip.",
    input_schema: { type: "object", properties: { kinds: { type: "array", items: { type: "string", enum: [...KINDS] }, description: "Kinds to look for; omit for anything open around them." } } },
    eager_input_streaming: true,
  },
  {
    name: "propose_trip",
    description: "Propose sharing a walking trip to a destination. Shows a card with a 'Start with MIRA' button; nothing starts until they tap it. Give exactly one of saved_place (a label from their saved places) or place_ref (from find_nearby).",
    input_schema: { type: "object", properties: { saved_place: { type: "string" }, place_ref: { type: "string" } } },
    eager_input_streaming: true,
  },
  {
    name: "check_trip",
    description: "Check the person's current trip (destination, ETA, state). Shows a status card if one is running.",
    input_schema: { type: "object", properties: {} },
    eager_input_streaming: true,
  },
  {
    name: "offer_report",
    description: "Offer to let them report something privately. Shows a card that opens the report form preset to this category.",
    input_schema: {
      type: "object",
      properties: { category: { type: "string", enum: REPORT_CATEGORIES }, label: { type: "string", description: "Short human label, e.g. 'being followed'" } },
      required: ["category", "label"],
    },
    eager_input_streaming: true,
  },
  {
    name: "show_emergency_help",
    description: "Show the emergency card: a big 'Call 112' button and an offer to share their live location with trusted contacts. Use first whenever someone may be in danger.",
    input_schema: { type: "object", properties: {} },
    eager_input_streaming: true,
  },
  {
    name: "suggest_saving_home",
    description: "Show a button to save their home, so sharing the walk home is one tap next time.",
    input_schema: { type: "object", properties: {} },
    eager_input_streaming: true,
  },
];

const inputs = {
  find_nearby: z.object({ kinds: z.array(z.enum(KINDS)).max(5).optional() }).strict(),
  propose_trip: z.object({ saved_place: z.string().max(80).optional(), place_ref: z.string().max(10).optional() }).strict(),
  check_trip: z.object({}).strict(),
  offer_report: z.object({ category: z.enum(REPORT_CATEGORIES), label: z.string().trim().min(1).max(60) }).strict(),
  show_emergency_help: z.object({}).strict(),
  suggest_saving_home: z.object({}).strict(),
};

/** Words that must always surface the emergency card, whatever the model does. */
const DANGER = /\b(danger|help me|help!|scared|emergency|threat|attack|bachao|bachaao|dar lag|koi peecha|following me|is following|someone.*follow)/i;

let client: Anthropic | null = null;
function anthropic(apiKey: string) {
  client ??= new Anthropic({ apiKey, timeout: 30_000, maxRetries: 1 });
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

export async function* claudeMira(opts: { apiKey: string; message: string; history: MiraTurn[]; tools: MiraTools; firstName: string }): AsyncGenerator<MiraEvent> {
  const { tools, firstName } = opts;
  const [ctx, saved, contacts, trip] = await Promise.all([tools.getContext(), tools.listSavedPlaces(), tools.trustedContacts(), tools.tripStatus()]);
  const clock = `${((ctx.hour + 11) % 12) + 1}:${String(ctx.minute).padStart(2, "0")} ${ctx.hour < 12 ? "am" : "pm"}`;
  const context = [
    `Person: ${firstName}.`,
    `Local time: ${clock} (${ctx.daypart}).`,
    ctx.hasLocation ? `They're ${ctx.area ? (ctx.area.startsWith("Near ") ? `near ${ctx.area.slice(5)}` : `in ${ctx.area}`) : "somewhere we have no area name for"}.` : "Their location is off.",
    `Saved places: ${saved.length ? saved.map((p) => `${p.emoji} ${p.label}`).join(", ") : "none yet"}.`,
    `Trusted contacts who'd follow a shared trip: ${contacts.length ? contacts.join(", ") : "none yet"}.`,
    trip && (trip.state === "active" || trip.state === "missed") ? `They have a trip running to ${trip.destination.name} (${trip.state}).` : "No trip running.",
  ].join("\n");

  const refs = new Map<string, { name: string; lat: number; lon: number; kind: string }>();
  let lookedAround = false; // find_nearby ran: the reply describes what's around them
  const sensitive: string[] = [];
  const cards: MiraCard[] = [];
  let spoken = "";
  const messages = toMessages(opts.history, opts.message);
  const api = anthropic(opts.apiKey);

  async function runTool(name: string, raw: unknown): Promise<{ result: unknown; card?: MiraCard; error?: string }> {
    const schema = inputs[name as keyof typeof inputs];
    if (!schema) return { result: null, error: `Unknown tool ${name}` };
    const parsed = schema.safeParse(raw ?? {});
    if (!parsed.success) return { result: null, error: `Invalid input: ${parsed.error.issues.map((i) => i.message).join("; ")}` };
    const input = parsed.data as Record<string, unknown>;
    switch (name) {
      case "find_nearby": {
        if (!ctx.hasLocation) return { result: { error: "Location is off, so I can't look around them." } };
        const found = await tools.findNearby(input.kinds as string[] | undefined);
        lookedAround = true;
        const list = found.map((p, i) => {
          const ref = `p${refs.size + i + 1}`;
          refs.set(ref, { name: p.name, lat: p.lat, lon: p.lon, kind: p.kind });
          sensitive.push(p.name);
          return { place_ref: ref, name: p.name, kind: p.kind, walking_distance_m: p.distanceM ?? null, listed_hours: p.hours ?? null };
        });
        const card: MiraCard | undefined = found.length ? { type: "places", title: "Close by", places: found.map((p) => ({ name: p.name, kind: p.kind, distanceM: p.distanceM, lat: p.lat, lon: p.lon })) } : undefined;
        return { result: list.length ? list : { none: "No such places in the map data I have for this area." }, card };
      }
      case "propose_trip": {
        const savedPlace = typeof input.saved_place === "string" ? saved.find((p) => p.label.toLowerCase() === (input.saved_place as string).toLowerCase()) : undefined;
        const ref = typeof input.place_ref === "string" ? refs.get(input.place_ref) : undefined;
        const dest = savedPlace ? { name: savedPlace.label, lat: savedPlace.lat, lon: savedPlace.lon } : ref ? { name: ref.name, lat: ref.lat, lon: ref.lon } : null;
        if (!dest) return { result: { error: "Unknown destination. Use a saved place label or a place_ref from find_nearby." } };
        const { lighting, ...t } = await tools.proposeTrip(dest);
        return {
          result: {
            destination: dest.name,
            walk_minutes: t.minutes,
            contacts_who_would_follow: t.contacts,
            ...(lighting ? { street_lighting_percent_of_route: lighting, lighting_note: "lit = mapped as lit in OpenStreetMap (or confirmed by MIRA walkers); poles = streetlights mapped, may not work; dark = mapped as unlit or reported dark; unknown = not known. Say 'mapped as lit', mention the unknown share, and never call a route safe or unsafe." } : {}),
            note: "Shown as a card; nothing starts until they tap it.",
          },
          card: { type: "trip", ...t },
        };
      }
      case "check_trip": {
        const t = await tools.tripStatus();
        if (!t || (t.state !== "active" && t.state !== "missed")) return { result: { trip: "none running" } };
        const minutesLeft = Math.round((new Date(t.etaAt).getTime() - Date.now()) / 60_000);
        return { result: { destination: t.destination.name, state: t.state, minutes_until_eta: minutesLeft }, card: { type: "trip_status", destination: t.destination.name, etaAt: t.etaAt, state: t.state } };
      }
      case "offer_report":
        return { result: { shown: true }, card: { type: "report", category: input.category as string, label: input.label as string } };
      case "show_emergency_help":
        return { result: { shown: true, trusted_contacts: contacts }, card: { type: "sos", contacts } };
      case "suggest_saving_home":
        return { result: { shown: true }, card: { type: "save_place" } };
    }
    return { result: null, error: `Unhandled tool ${name}` };
  }

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const stream = api.messages.stream({
      model: MIRA_MODEL,
      max_tokens: 1024,
      output_config: { effort: "low" }, // a quick companion reply, not deep research
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

  // Safety net: danger words always surface the emergency card, even if the model didn't.
  if (DANGER.test(opts.message) && !cards.some((c) => c.type === "sos")) {
    const card: MiraCard = { type: "sos", contacts };
    cards.push(card);
    yield { type: "card", card };
  }
  // A reply describing what's around them can't be reliably scrubbed (the model paraphrases
  // names), so that turn is saved as a neutral line; other turns are scrubbed.
  yield { type: "history", text: lookedAround ? "I showed you places near you (not saved, for your privacy)." : scrubForHistory(spoken, sensitive, ctx.area) };
  yield { type: "done" };
}
