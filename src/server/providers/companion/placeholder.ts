import "server-only";
import type { MiraCard, MiraEvent, MiraTurn } from "./types";
import type { MiraTools } from "./tools";

/**
 * Placeholder Mira: deterministic intent routing over the real tools, written in Mira's
 * voice (see persona.ts). It never invents facts — everything comes from tools — and
 * says plainly when a request is beyond what it can do yet. Claude replaces this
 * engine later behind the same event stream.
 */

const RX = {
  danger: /\b(danger|help me|help!|scared|emergency|threat|attack|bachao|bachaao|dar lag|koi peecha|following me|is following|someone.*follow)/i,
  uneasy: /\b(uneasy|nervous|anxious|weird|uncomfortable|creepy|not ok|not okay|ajeeb|ghabra|dar)\b/i,
  home: /\b(home|ghar|hostel|pg|room|going back|wapas)\b/i,
  nearby: /\b(pharmacy|pharmacies|medic\w*|dawai|dawa|chemist|hospital|clinic|doctor|metro|atm|bank|cafe|coffee|chai|food|eat|toilet|washroom|restroom|bus|open|nearby|near me|paas)\b/i,
  report: /\b(report|harass\w*|catcall\w*|star(e|ing)|groped|touch\w*|lighting|street ?light|dark|broken|pothole|footpath)\b/i,
  trip: /\b(my trip|eta|how long|how far|am i late)\b/i,
  hello: /^\s*(hi+|hello|hey+|namaste|hola|good (morning|afternoon|evening|night)|yo)\b/i,
  who: /\b(who are you|what can you do|what do you do|help\b|kya kar sakti)/i,
  thanks: /\b(thanks|thank you|thx|shukriya|dhanyavaad)\b/i,
  hinglish: /\b(hai|kya|mujhe|mera|meri|nahi|haan|ghar|jana|chal|kaise|kahan|acha|theek)\b/i,
};

const NEARBY_FILTER: Array<[RegExp, string[], string]> = [
  [/pharm|medic|dawa|chemist/i, ["pharmacy"], "pharmacies"],
  [/hospital|clinic|doctor/i, ["health"], "clinics"],
  [/metro/i, ["metro"], "metro entrances"],
  [/atm|bank/i, ["finance"], "ATMs"],
  [/cafe|coffee|chai|food|eat/i, ["food"], "places to eat"],
  [/toilet|washroom|restroom/i, ["toilets"], "toilets"],
  [/bus/i, ["bus"], "bus stops"],
];

const REPORT_CATEGORY: Array<[RegExp, string, string]> = [
  [/harass|catcall|star/i, "harassment", "harassment"],
  [/groped|touch/i, "unwanted_touching", "unwanted touching"],
  [/follow/i, "following_stalking", "being followed"],
  [/light|dark|broken|pothole|footpath/i, "environment", "a street problem"],
];

function joinNames(xs: string[]): string {
  if (xs.length <= 1) return xs[0] ?? "";
  return `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`;
}

async function* speak(text: string): AsyncGenerator<MiraEvent> {
  const parts = text.match(/\S+\s*/g) ?? [text];
  for (const p of parts) {
    yield { type: "text", delta: p };
    await new Promise((r) => setTimeout(r, 18));
  }
}

export async function* placeholderMira(message: string, history: MiraTurn[], tools: MiraTools, firstName: string): AsyncGenerator<MiraEvent> {
  const m = message.trim();
  const hinglish = RX.hinglish.test(m);
  const cards: MiraCard[] = [];
  let reply: string;

  const places = await tools.listSavedPlaces();
  const home = places.find((p) => /home|hostel|pg/i.test(p.label));
  const named = places.find((p) => new RegExp(`\\b${p.label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(m));

  if (RX.danger.test(m)) {
    const contacts = await tools.trustedContacts();
    reply = `If you're in danger right now, please call 112. ${contacts.length ? `I can share your live location with ${joinNames(contacts)} straight away.` : "Head towards people and lit, open places if you can."}`;
    cards.push({ type: "sos", contacts });
    if (home) cards.push({ type: "trip", ...(await tools.proposeTrip({ name: home.label, lat: home.lat, lon: home.lon })) });
  } else if (RX.uneasy.test(m)) {
    const open = await tools.findNearby(["pharmacy", "metro", "police", "health", "food"]);
    reply = hinglish
      ? `Main yahin hoon, ${firstName}. ${open.length ? "Paas mein kuch jagah hain jahan log hote hain:" : ""} Chaho toh main tumhari trip share kar doon.`
      : `I'm right here, ${firstName}. ${open.length ? "There are a few places close by where people usually are." : ""} Want me to share your trip so someone you trust can follow along?`;
    if (open.length) cards.push({ type: "places", title: "Close by", places: open });
    if (home) cards.push({ type: "trip", ...(await tools.proposeTrip({ name: home.label, lat: home.lat, lon: home.lon })) });
  } else if (named || RX.home.test(m)) {
    const target = named ?? home;
    if (target) {
      const t = await tools.proposeTrip({ name: target.label, lat: target.lat, lon: target.lon });
      reply = hinglish
        ? `Chalo, ${target.label} chalte hain${t.minutes ? ` — lagbhag ${t.minutes} min ka walk` : ""}. ${t.contacts.length ? `${joinNames(t.contacts)} tumhe live dekh payenge.` : ""}`
        : `Let's get you to ${target.label}${t.minutes ? ` — about a ${t.minutes}-minute walk` : ""}. ${t.contacts.length ? `${joinNames(t.contacts)} will be able to follow along live.` : "I'll check you arrive."}`;
      cards.push({ type: "trip", ...t });
    } else {
      reply = "I don't know where home is yet. Save it once and next time it's a single tap.";
      cards.push({ type: "save_place" });
    }
  } else if (RX.report.test(m)) {
    const [, category, label] = REPORT_CATEGORY.find(([rx]) => rx.test(m)) ?? [null, "other", "what happened"];
    reply = `I'm sorry that happened. You can tell me about ${label} privately — it's reviewed before anything is shared, and only ever as a combined, anonymous note.`;
    cards.push({ type: "report", category, label });
  } else if (RX.nearby.test(m)) {
    const f = NEARBY_FILTER.find(([ask]) => ask.test(m));
    const found = await tools.findNearby(f?.[1]);
    const ctx = await tools.getContext();
    if (!ctx.hasLocation) reply = "Turn on location and I'll look around you.";
    else if (found.length) {
      reply = `Here ${found.length === 1 ? "is" : "are"} the closest ${f?.[2] ?? "places"} I know of. Listed hours can be out of date, so it's worth a quick check.`;
      cards.push({ type: "places", title: f ? `Nearby ${f[2]}` : "Nearby", places: found });
    } else reply = `I couldn't find ${f?.[2] ?? "anything like that"} in the map data I have for this area yet.`;
  } else if (RX.trip.test(m)) {
    const trip = await tools.tripStatus();
    if (trip && (trip.state === "active" || trip.state === "missed")) {
      reply = `You're on your way to ${trip.destination.name}.`;
      cards.push({ type: "trip_status", destination: trip.destination.name, etaAt: trip.etaAt, state: trip.state });
    } else reply = "You don't have a trip running. Tell me where you're headed and I'll set one up.";
  } else if (RX.hello.test(m) && m.length < 40) {
    const ctx = await tools.getContext();
    const when = ctx.hour < 12 ? "morning" : ctx.hour < 17 ? "afternoon" : "evening";
    reply = hinglish
      ? `Hi ${firstName}! ${ctx.area ? `Tum ${ctx.area.replace(/^Near /, "")} ke paas ho. ` : ""}Kahan ja rahi ho?`
      : `Good ${when}, ${firstName}! ${ctx.area ? `Looks like you're ${ctx.area.toLowerCase().startsWith("near") ? ctx.area.charAt(0).toLowerCase() + ctx.area.slice(1) : "in " + ctx.area}. ` : ""}Where are you headed?`;
    if (ctx.late && home) cards.push({ type: "trip", ...(await tools.proposeTrip({ name: home.label, lat: home.lat, lon: home.lon })) });
  } else if (RX.thanks.test(m)) {
    reply = hinglish ? "Koi baat nahi! Main yahin hoon." : "Anytime. I'm here whenever you're heading out.";
  } else if (RX.who.test(m)) {
    reply = `I'm Mira, your walking companion. I can share your trip live with people you trust, find what's open around you, and help you report something privately. I'm not an emergency service — for that, call 112.`;
  } else {
    reply = `I'm still learning to chat about everything. Right now I'm best at sharing your trip, finding what's open nearby, and private reports — try "take me home" or "pharmacy near me".`;
  }

  void history;
  yield* speak(reply.replace(/\s+/g, " ").trim());
  for (const card of cards) yield { type: "card", card };
  yield { type: "done" };
}
