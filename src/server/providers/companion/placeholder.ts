import "server-only";
import type { MiraCard, MiraEvent, MiraTurn } from "./types";
import type { MiraTools } from "./tools";
import { daypartFor } from "@/domain/daypart";
import { emergencyLine, emergencySentence, noNumberReason, type CountryContext } from "@/domain/country-context";
import { clock12 } from "./clock";
import { circleSharingLine } from "@/domain/companion-output";
import { DANGER, JUDGEMENT } from "./signals";

/**
 * Scripted Mira: deterministic intent routing over the real tools, written in Mira's voice
 * (see persona.ts). Used when Claude isn't configured, fails, or the daily token budget is
 * spent. It never invents facts — everything comes from tools and the Country Context —
 * and says plainly when a request is beyond what it can do. English and Hinglish only.
 */

const RX = {
  danger: DANGER,
  judgement: JUDGEMENT,
  uneasy: /\b(uneasy|nervous|anxious|weird|uncomfortable|creepy|not ok|not okay|ajeeb|ghabra|dar)\b/i,
  staffed: /\b(staffed|help point|somewhere with people|where people are|somewhere open|police station|hospital)\b/i,
  sosInfo: /\b(emergency number|police number|ambulance number|what do i dial|which number|helpline)\b/i,
  safetyNews: /\b(safety updates?|safety news|recent (?:safety |crime )?(?:news|incidents?|reports?|updates?)|what'?s been happening|news (?:about|in|for) (?:this|the|my) (?:city|area))\b/i,
  share: /\b(share (?:this|my|the) (?:trip|journey|walk|location|link)|send (?:my |the )?(?:live )?link|tell my people|share (?:it |this )?with my (?:people|circle|family|friends|mum|mom)|trip share kar)\b/i,
  home: /\b(home|ghar|hostel|pg|room|going back|wapas)\b/i,
  nearby: /\b(pharmacy|pharmacies|medic\w*|dawai|dawa|chemist|clinic|doctor|metro|atm|bank|cafe|coffee|chai|food|eat|toilet|washroom|restroom|bus|open|nearby|near me|paas)\b/i,
  // "near my destination", "where I'm going": never answered with places around her.
  atDestination: /\b(near (?:my |the )?destination|at my destination|where i'?m (?:going|headed|heading)|when i (?:get|arrive) there|near there)\b/i,
  report: /\b(report|harass\w*|catcall\w*|star(e|ing)|groped|touch\w*|lighting|street ?light|dark|broken|pothole|footpath)\b/i,
  trip: /\b(my trip|my journey|my walk|my route|this (?:walk|trip|journey|route)|the (?:walk|route)|eta|how long|how far|am i late)\b/i,
  time: /\b(what time|what's the time|whats the time|time kya|kitne baje|kya time|time hai)\b/i,
  hello: /^\s*(hi+|hello|hey+|namaste|hola|bonjour|salaam|good (morning|afternoon|evening|night)|yo)\b/i,
  who: /\b(who are you|what can you do|what do you do|help\b|kya kar sakti)/i,
  thanks: /\b(thanks|thank you|thx|shukriya|dhanyavaad|gracias|merci)\b/i,
  hinglish: /\b(hai|kya|mujhe|mera|meri|nahi|haan|ghar|jana|chal|kaise|kahan|acha|theek)\b/i,
};

const NEARBY_FILTER: Array<[RegExp, string[], string]> = [
  [/pharm|medic|dawa|chemist/i, ["pharmacy"], "pharmacies"],
  [/clinic|doctor/i, ["health"], "clinics"],
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

type Proposed = { destination: { name: string; lat: number; lon: number }; minutes: number | null; contacts: string[]; email: boolean; whatsapp?: string[] };

/** A trip card carries only what the card shows (no route-derived extras like lighting). */
function tripCard(t: Proposed): MiraCard {
  return { type: "trip", destination: t.destination, minutes: t.minutes, contacts: t.contacts, email: t.email, whatsapp: t.whatsapp };
}

function joinNames(xs: string[]): string {
  if (xs.length <= 1) return xs[0] ?? "";
  return `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`;
}

/** What starting does for her Circle — an attempt by email when it's on, never a promise. */
function circleLine(t: Proposed, hinglish: boolean): string {
  // No Circle: nobody is alerted, so never imply someone is watching — MIRA only notices arrival.
  const wa = t.whatsapp ?? [];
  if (wa.length && !hinglish) return circleSharingLine(t.contacts, t.email, wa);
  if (wa.length) return `Start karne ke baad ${joinNames(wa)} ko WhatsApp pe apna live link ek tap mein bhejna (Send tum dabaogi).${t.contacts.length && t.email ? ` MIRA ${joinNames(t.contacts)} ko email karne ki koshish bhi karegi.` : ""}`;
  if (!t.contacts.length) return hinglish ? "Koi automatically alert nahi hoga — start ke baad apna live link khud bhejna." : "Nobody is alerted automatically — after you start, send your live link to anyone you choose.";
  if (hinglish) return t.email ? `Start karte hi MIRA ${joinNames(t.contacts)} ko tumhara live link email karne ki koshish karegi (email fail bhi ho sakta hai).` : "Email abhi band hai, toh start karne ke baad apna live link khud bhejna.";
  return t.email ? `MIRA will try to email ${joinNames(t.contacts)} your live link when you start (sending can fail).` : "Email isn't switched on, so share your live link yourself after you start.";
}

export { emergencySentence };

function emergencyFacts(c: CountryContext): string {
  const p = c.emergency.primary;
  const where = c.countryName ?? "this country";
  if (!p) return `${noNumberReason(c)} Use the Emergency options button for that explanation.`;
  const help = c.helplines.map((h) => `${h.number} (${h.name})`);
  return `In ${where}, ${emergencyLine(c)}${help.length ? ` Helplines: ${help.join(", ")}.` : ""}`;
}

// Marks location-derived fragments inside a reply: streamed, never stored (see MiraEvent).
const P0 = "\u0001";
const P1 = "\u0002";
const priv = (s: string) => (s ? `${P0}${s}${P1}` : "");

async function* speak(text: string): AsyncGenerator<MiraEvent> {
  // Split into public / private runs, then stream word by word. Leading space is kept, so a
  // private run starting " — about…" doesn't glue onto the word before it ("Home— about").
  const runs = text.split(new RegExp(`(${P0}[^${P1}]*${P1})`)).filter(Boolean);
  for (const run of runs) {
    const isPrivate = run.startsWith(P0);
    const body = isPrivate ? run.slice(1, -1) : run;
    for (const p of body.match(/\s*\S+\s*/g) ?? []) {
      yield isPrivate ? { type: "text", delta: p, private: true } : { type: "text", delta: p };
      await new Promise((r) => setTimeout(r, 18));
    }
  }
}

export async function* placeholderMira(message: string, history: MiraTurn[], tools: MiraTools, firstName: string): AsyncGenerator<MiraEvent> {
  const m = message.trim();
  const hinglish = RX.hinglish.test(m);
  const cards: MiraCard[] = [];
  let reply: string;

  // Emergency never waits: the card goes out before anything else is looked up.
  if (RX.danger.test(m)) {
    const contacts = await tools.trustedContacts();
    yield { type: "card", card: { type: "sos", contacts } };
    const ctx = await tools.getContext();
    const places = await tools.listSavedPlaces();
    const home = places.find((p) => /home|hostel|pg/i.test(p.label));
    const help = ctx.hasLocation ? await tools.findHelpPoints("emergency") : { points: [], failed: false };
    reply = `If you're in danger right now, ${emergencySentence(ctx.country)}. Head towards people and lit, open places if you can.${home ? " Your journey home is on the card below if you want to share it." : ""}`;
    if (help.points.length) cards.push({ type: "help_points", title: "Nearest Help Points", points: help.points });
    if (home) cards.push(tripCard(await tools.proposeTrip({ name: home.label, lat: home.lat, lon: home.lon })));
    yield* speak(reply.replace(/[ \t\n]+/g, " ").trim());
    for (const card of cards) yield { type: "card", card };
    yield { type: "done" };
    return;
  }

  const ctx0 = await tools.getContext();
  const part = daypartFor(ctx0.hour);
  const places = await tools.listSavedPlaces();
  const home = places.find((p) => /home|hostel|pg/i.test(p.label));
  const named = places.find((p) => new RegExp(`\\b${p.label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(m));
  const current = await tools.tripStatus();
  const running = current && (current.state === "active" || current.state === "missed") ? current : null;
  const statusCard = (t: NonNullable<typeof running>): MiraCard => ({ type: "trip_status", destination: t.destination.name, etaAt: t.etaAt, state: t.state });
  // Nudges towards the walk home only when nothing is running (never a second, unrequested trip).
  const offerHome = !running && home;

  if (RX.judgement.test(m)) {
    const help = ctx0.hasLocation ? await tools.findHelpPoints("nearby") : { points: [], failed: false };
    const p = ctx0.country.emergency.primary;
    // A number that only reaches some services is never presented as "the" emergency number.
    const num = p?.scope === "all" ? `remind you the emergency number here is ${p.number}, ` : p ? "show the Emergency options for each service here, " : "";
    reply = `I don't have enough verified information to make that judgement. What I can do: ${help.points.length ? "show Help Points near you and their hours, " : ""}${num}and share your journey with someone you trust.`;
    if (help.points.length) cards.push({ type: "help_points", title: "Help Points near you", points: help.points });
  } else if (RX.sosInfo.test(m)) {
    reply = emergencyFacts(ctx0.country);
    cards.push({ type: "sos", contacts: await tools.trustedContacts() });
  } else if (RX.safetyNews.test(m)) {
    reply = tools.safetyUpdatesOn()
      ? "Recent Safety updates for your city are in the Safety updates section on Home: news reports with their publisher and date. They're reported context, not a verdict on any area, and no updates doesn't mean nothing happened."
      : "Safety updates (news reports for a city) aren't switched on in this version of MIRA, so I can't show any.";
  } else if (RX.share.test(m)) {
    // No tool sends anything: the Trip screen has "Send my live link" and "Tell my people now".
    if (running) {
      reply = `I can't send anything myself. Open your journey to ${running.destination.name} (tap the card) and use "Send my live link", or "Tell my people now" to email your Circle.`;
      cards.push(statusCard(running));
    } else reply = "You don't have a journey running yet. Tell me where you're headed and I'll get one ready — once you start it, the Trip screen has \"Send my live link\".";
  } else if (RX.uneasy.test(m) || RX.staffed.test(m)) {
    const uneasy = RX.uneasy.test(m);
    const { points: help, failed } = await tools.findHelpPoints(uneasy ? "unsafe" : "nearby");
    if (!ctx0.hasLocation) reply = "Turn on location and I'll find the nearest Help Points. The Emergency button works either way.";
    else
      reply = uneasy
        ? hinglish
          ? `Main yahin hoon, ${firstName}. ${help.length ? "Paas mein kuch Help Points hain." : ""} Chaho toh main tumhari trip share kar doon.`
          : `I'm right here, ${firstName}. ${help.length ? "These are the nearest Help Points — places where help is usually available." : failed ? "I couldn't check Help Points just now." : ""} Want me to set up your journey so you can share it with someone you trust?`
        : help.length
          ? "Here are the nearest Help Points. Hours are as the source lists them."
          : failed
            ? "I couldn't check Help Points just now — the map lookup failed. The Emergency button works either way."
            : "I don't have Help Point results to show right now. That doesn't mean there are none nearby.";
    if (help.length) cards.push({ type: "help_points", title: uneasy ? "Nearest Help Points" : "Help Points near you", points: help });
    if (uneasy && offerHome) cards.push(tripCard(await tools.proposeTrip({ name: offerHome.label, lat: offerHome.lat, lon: offerHome.lon })));
  } else if (running && RX.trip.test(m)) {
    const left = Math.round((new Date(running.etaAt).getTime() - Date.now()) / 60_000);
    reply = `You're on your way to ${running.destination.name}${running.state === "missed" ? ", past your ETA" : left >= 0 ? `, ETA in about ${left} min` : ""}. Lighting and Help Points along the way are on the route sheet — tap the card to open your journey.`;
    cards.push(statusCard(running));
  } else if (named || RX.home.test(m)) {
    const target = named ?? home;
    if (target) {
      const t = await tools.proposeTrip({ name: target.label, lat: target.lat, lon: target.lon });
      reply = hinglish
        ? `Chalo, ${target.label} chalte hain${t.minutes ? priv(` — lagbhag ${t.minutes} min ka walk`) : ""}. ${circleLine(t, true)}`
        : `Let's get you to ${target.label}${t.minutes ? priv(` — about a ${t.minutes}-minute walk`) : ""}. ${circleLine(t, false)}`;
      cards.push(tripCard(t));
    } else {
      reply = "I don't know where home is yet. Save it once and next time it's a single tap.";
      cards.push({ type: "save_place" });
    }
  } else if (RX.report.test(m)) {
    const [, category, label] = REPORT_CATEGORY.find(([rx]) => rx.test(m)) ?? [null, "other", "what happened"];
    reply = `I'm sorry that happened. You can tell me about ${label} privately — it's only ever shared as a combined, anonymous note.`;
    cards.push({ type: "report", category, label });
  } else if (RX.nearby.test(m)) {
    const f = NEARBY_FILTER.find(([ask]) => ask.test(m));
    const what = f?.[2] ?? "places";
    const around = RX.atDestination.test(m) ? (running?.destination ?? null) : null;
    if (RX.atDestination.test(m) && !around) reply = `You don't have a journey running, so I don't know where you're headed. Tell me the place and I can look for ${what} there.`;
    else if (!around && !ctx0.hasLocation) reply = "Turn on location and I'll look around you.";
    else {
      const found = await tools.findNearby(f?.[1], around ?? undefined);
      const open = found.filter((p) => p.openNow === "open").map((p) => p.name);
      const where = around ? `near ${around.name}` : "I know of";
      if (found.length) {
        reply = `Here ${found.length === 1 ? "is" : "are"} the closest ${what} ${where}. ${open.length ? `Listed as open now: ${joinNames(open)}. Listed hours can be out of date.` : "Their hours aren't known, so it's worth a quick check."}`;
        cards.push({ type: "places", title: around ? `Near ${around.name}` : f ? `Nearby ${f[2]}` : "Nearby", places: found });
      } else reply = `I couldn't find ${f?.[2] ?? "anything like that"} ${around ? `near ${around.name} ` : ""}in the map data I have. That doesn't mean there are none.`;
    }
  } else if (RX.trip.test(m)) {
    reply = "You don't have a journey running. Tell me where you're headed and I'll get one ready for you to start.";
  } else if (RX.time.test(m)) {
    const clock = clock12(ctx0.hour, ctx0.minute);
    reply = part === "night"
      ? `It's ${clock}. ${running ? `You're on your way to ${running.destination.name}.` : home ? `Getting late — want me to share your walk to ${home.label}?` : "Getting late — if you're heading out, I can share your journey live."}`
      : `It's ${clock} where you are.`;
    if (part === "night" && offerHome) cards.push(tripCard(await tools.proposeTrip({ name: offerHome.label, lat: offerHome.lat, lon: offerHome.lon })));
  } else if (RX.hello.test(m) && m.length < 40) {
    const ctx = ctx0;
    const where = ctx.area ? (ctx.area.toLowerCase().startsWith("near") ? ctx.area.charAt(0).toLowerCase() + ctx.area.slice(1) : "in " + ctx.area) : null;
    const open = {
      dawn: `Morning, ${firstName}! ☀️ Early start?`,
      day: `${ctx.hour < 12 ? "Good morning" : "Good afternoon"}, ${firstName}!`,
      evening: `Good evening, ${firstName} 🌆`,
      night: `Hey ${firstName} 🌙 It's late.`,
    }[part];
    const ask = running ? `You're on your way to ${running.destination.name}.` : part === "night" ? (home ? `Want me to share your walk to ${home.label}?` : "Heading somewhere? I can share your journey live.") : "Where are you headed?";
    reply = hinglish
      ? `Hi ${firstName}! ${ctx.area ? priv(`Tum ${ctx.area.replace(/^Near /, "")} ke paas ho. `) : ""}${part === "night" ? "Kaafi late ho gaya hai — ghar tak ki walk share kar doon?" : "Kahan ja rahi ho?"}`
      : `${open} ${where ? priv(`Looks like you're ${where}. `) : ""}${ask}`;
    if (ctx.late && offerHome) cards.push(tripCard(await tools.proposeTrip({ name: offerHome.label, lat: offerHome.lat, lon: offerHome.lon })));
    if (running) cards.push(statusCard(running));
  } else if (RX.thanks.test(m)) {
    reply = hinglish ? "Koi baat nahi! Main yahin hoon." : part === "night" ? "Anytime 🌙 I'm around if you head out again." : "Anytime. I'm here whenever you're heading out.";
  } else if (RX.who.test(m)) {
    reply = `I'm Mira, your travel companion. I can share your journey live with people you trust, find Help Points and what's open around you, and help you report something privately. I'm not an emergency service — for that, ${emergencySentence(ctx0.country)}.`;
  } else {
    reply = `I can't answer that one yet. Right now I'm best at sharing your journey, finding Help Points and what's open nearby, and private reports — try "take me home" or "find Help Points nearby".`;
    if (part === "night" && offerHome) {
      reply += ` It's late, so here's your walk to ${offerHome.label} if you want it.`;
      cards.push(tripCard(await tools.proposeTrip({ name: offerHome.label, lat: offerHome.lat, lon: offerHome.lon })));
    }
  }

  void history;
  yield* speak(reply.replace(/[ \t\n]+/g, " ").trim());
  for (const card of cards) yield { type: "card", card };
  yield { type: "done" };
}
