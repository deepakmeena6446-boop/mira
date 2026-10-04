import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { placeholderMira } from "@/server/providers/companion/placeholder";
import { MIRA_PERSONA } from "@/server/providers/companion/persona";
import { claudeMira, contextBlock, safeArea, TOOL_GUIDE, TOOLS, DEFAULT_MIRA_MODEL, type MiraClient } from "@/server/providers/companion/claude";
import { respond, withFallback } from "@/server/providers/companion";
import { CAPABILITIES_QUESTION, DANGER, JUDGEMENT, verdictWords } from "@/server/providers/companion/signals";
import { localClock } from "@/server/providers/companion/clock";
import { coverageLine, safetyUpdatesSummary, type MiraNow } from "@/server/providers/companion/tools";
import { UNKNOWN_COUNTRY, capabilitiesFor, type CountryContext } from "@/domain/country-context";
import type { MiraCard, MiraEvent, MiraHelpPoint } from "@/server/providers/companion/types";
import type { MiraTools } from "@/server/providers/companion/tools";
import type { SafetyUpdate } from "@/domain/safety-updates";

const home = { id: "h", label: "Home", emoji: "🏠", lat: 28.69, lon: 77.21, address: null };

const GB: CountryContext = {
  ...UNKNOWN_COUNTRY,
  iso: "GB",
  countryName: "United Kingdom",
  classification: "un_member",
  timezone: "Europe/London",
  emergency: { ...UNKNOWN_COUNTRY.emergency, status: "VERIFIED", reviewed: "2026-09-26", primary: { number: "999", label: "Emergency (police, fire, ambulance)", scope: "all" }, also: [{ number: "112", label: "Emergency" }], source: { title: "gov.uk", url: "https://www.gov.uk" } },
  capabilities: capabilitiesFor("VERIFIED"),
};
const KE: CountryContext = { ...UNKNOWN_COUNTRY, iso: "KE" };

const HELP: MiraHelpPoint[] = [{ name: "St Thomas' Hospital", label: "Hospital", emoji: "🏥", minutes: 6, hours: "Open 24h", source: "Google Maps", lat: 51.4989, lon: -0.1186 }];

function now(over: Partial<MiraNow> = {}): MiraNow {
  return { hour: 22, minute: 5, weekday: "Friday", isoDay: 4, timeZone: "Europe/London", daypart: "night", late: true, area: "Near Gate 3", hasLocation: true, country: GB, ...over };
}

function tools(over: Partial<Record<keyof MiraTools, unknown>> = {}): MiraTools {
  return {
    getContext: async () => now(),
    coverage: () => coverageLine(true, true),
    emailOn: () => true,
    safetyUpdatesOn: () => true,
    safetyUpdates: async () => ({ status: "couldnt_check", area: "London" }),
    listSavedPlaces: async () => [home],
    findNearby: async (kinds?: string[]) => (kinds?.includes("pharmacy") ? [{ id: "p", name: "Apollo Pharmacy", kind: "Pharmacy", lat: 28.69, lon: 77.21, distanceM: 120, openNow: "not_known" }] : []),
    findHelpPoints: async () => ({ points: HELP, failed: false }),
    proposeTrip: async (d: { name: string; lat: number; lon: number }, mode = "walk") => ({ destination: d, minutes: mode === "walk" ? 12 : null, contacts: ["Mum"], context: [], mode, email: true, helpLookupFailed: false }),
    tripStatus: async () => null,
    trustedContacts: async () => ["Mum"],
    ...over,
  } as unknown as MiraTools;
}

async function collect(gen: AsyncGenerator<MiraEvent>) {
  let text = "";
  const cards: MiraCard[] = [];
  const events: MiraEvent[] = [];
  for await (const ev of gen) {
    events.push(ev);
    if (ev.type === "text") text += ev.delta;
    if (ev.type === "card") cards.push(ev.card);
  }
  return { text, cards, events };
}

const run = (msg: string, t = tools()) => collect(placeholderMira(msg, [], t, "Priya"));

describe("Mira capabilities questions", () => {
  it.each(["What u can help me with?", "What can Mira help me with?", "What can you do?", "How can you help me?"])("answers %s directly", async (message) => {
    const r = await collect(respond(null as never, null as never, message, [], null as never));
    expect(r.text).toMatch(/nearby places and Help Points/);
    expect(r.text).toMatch(/you can send its live link/);
    expect(r.text).not.toMatch(/enough verified information|make that judgement/);
    expect(r.events.at(-1)).toEqual({ type: "done" });
  });

  it("does not intercept a specific request or safety question", () => {
    expect(CAPABILITIES_QUESTION.test("Can you help me find a pharmacy?")).toBe(false);
    expect(CAPABILITIES_QUESTION.test("What can you do if someone is following me?")).toBe(false);
    expect(CAPABILITIES_QUESTION.test("Is this area safe?")).toBe(false);
  });
});

describe("Mira (scripted engine)", () => {
  it.each(["how do I delete my data?", "can I download my information", "what do you keep about me"])("points data-rights questions to the real controls: %s (audit P15-005)", async (message) => {
    const r = await run(message);
    expect(r.text).toMatch(/Download my data/);
    expect(r.text).toMatch(/Delete my account/);
    expect(r.cards).toEqual([]);
  });
  it("proposes a trip home — never starts one by itself", async () => {
    const r = await run("take me home");
    expect(r.text).toMatch(/Home/);
    expect(r.cards.map((c) => c.type)).toEqual(["trip"]);
  });
  it("in danger: the Emergency card comes first, with the local number from the Country Context", async () => {
    const r = await run("someone is following me, I'm scared");
    expect(r.events[0]).toMatchObject({ type: "card", card: { type: "sos" } }); // before any text
    expect(r.text).toMatch(/call 999 now/);
    expect(r.cards.map((c) => c.type)).toContain("help_points");
  });
  it("in a country without a profile (Kenya), it says it doesn't know the number instead of guessing", async () => {
    const r = await run("help me!", tools({ getContext: async () => now({ country: KE, timeZone: "Africa/Nairobi" }) }));
    expect(r.text).toMatch(/MIRA doesn't know the local number here/);
    expect(r.text).not.toMatch(/\b\d{3}\b/);
    const info = await run("what's the emergency number here?", tools({ getContext: async () => now({ country: KE }) }));
    expect(info.text).toMatch(/has not yet been verified by MIRA/);
    expect(info.cards[0].type).toBe("sos");
    const uk = await run("what's the emergency number here?");
    expect(uk.text).toMatch(/United Kingdom, reviewed call options: 999/);
    // Naming the country she's in is "here" — no "not where you are now" (re-audit RA4).
    const named = await run("what's the emergency number in the United Kingdom?", tools({ emergencyFor: () => GB } as never));
    expect(named.text).not.toMatch(/not where you are now/);
    expect(named.cards[0]?.type).toBe("sos");
  });
  it("answers safety judgements with 'not enough verified information', then facts", async () => {
    const r = await run("Is this neighbourhood safe at night?");
    expect(r.text).toMatch(/^I don't have enough verified information to make that judgement\./);
    expect(r.text).not.toMatch(/\b(it's|is) (safe|unsafe|dangerous)\b/i);
    expect(r.cards.map((c) => c.type)).toEqual(["help_points"]);
  });
  it("finds Help Points when she's uneasy or asks for somewhere staffed", async () => {
    const uneasy = await run("I feel uneasy");
    expect(uneasy.cards.map((c) => c.type)).toEqual(["help_points", "trip"]);
    const staffed = await run("Find somewhere staffed nearby");
    expect(staffed.cards[0]).toMatchObject({ type: "help_points", points: [{ name: "St Thomas' Hospital", hours: "Open 24h", source: "Google Maps" }] });
  });
  it("finds nearby pharmacies from map data and admits when it has none", async () => {
    expect((await run("pharmacy near me")).cards[0].type).toBe("places");
    const none = await run("toilet near me");
    expect(none.text).toMatch(/couldn't find/);
  });
  it("offers a private report and understands Hinglish", async () => {
    expect((await run("a guy was staring and catcalling")).cards[0]).toMatchObject({ type: "report", category: "harassment" });
    expect((await run("mujhe ghar jana hai")).text).toMatch(/chalte hain/);
  });
  it("is honest about its limits and never claims to be human or an emergency service", async () => {
    const r = await run("what's the capital of France?");
    expect(r.text).toMatch(/can't answer that one yet/);
    const who = await run("who are you?");
    expect(who.text).toMatch(/not an emergency service — for that, call 999/);
    const whoKe = await run("who are you?", tools({ getContext: async () => now({ country: KE }) }));
    expect(whoKe.text).toMatch(/use the Emergency button/);
    expect(MIRA_PERSONA).toMatch(/Never claim to be human/);
    expect(MIRA_PERSONA).toMatch(/local emergency number from the context/);
    expect(MIRA_PERSONA).toMatch(/Never start a trip or send anything without the person tapping to confirm/);
    expect(MIRA_PERSONA).toMatch(/I don't have enough verified information to make that judgement/);
  });

  it("knows the time of day: tells the time, and leans towards the walk home at night", async () => {
    const at = (hour: number, minute = 0) => tools({ getContext: async () => now({ hour, minute, late: hour >= 21 || hour < 5, area: null }) });
    const late = await run("what time is it?", at(22, 5));
    expect(late.text).toMatch(/It's 10:05 pm/);
    expect(late.cards.map((c) => c.type)).toEqual(["trip"]);
    const noon = await run("what time is it?", at(12, 30));
    expect(noon.text).toBe("It's 12:30 pm where you are.");
    expect(noon.cards).toEqual([]);
    expect((await run("hi", at(6))).text).toMatch(/^Morning, Priya! ☀️ Early start\?/);
    expect((await run("hi", at(19))).text).toMatch(/^Good evening, Priya 🌆/);
    const night = await run("hi", at(23));
    expect(night.text).toMatch(/It's late\. .*share your walk to Home/);
  });
});

describe("No hardcoded emergency number", () => {
  it("persona, tool guide, tool descriptions and the scripted engine never contain 112 (it only comes from the Country Context)", () => {
    const src = (f: string) => readFileSync(`src/server/providers/companion/${f}`, "utf8");
    expect(MIRA_PERSONA).not.toMatch(/\b112\b/);
    expect(TOOL_GUIDE).not.toMatch(/\b(112|911|999|100)\b/);
    expect(JSON.stringify(TOOLS)).not.toMatch(/\b(112|911|999)\b/);
    for (const f of ["persona.ts", "placeholder.ts", "claude.ts", "tools.ts", "index.ts"]) expect(src(f)).not.toMatch(/\b112\b/);
  });
});

describe("Danger words (deterministic, multilingual)", () => {
  const danger = [
    "someone is following me",
    "I'm in danger",
    "help me!",
    "HELP",
    "a man attacked me",
    "he's threatening me",
    "bachao",
    "¡ayuda! me están siguiendo",
    "necesito ayuda",
    "socorro",
    "au secours",
    "à l'aide, on me suit",
    "Hilfe!",
    "ich werde verfolgt",
    "aiuto",
    "النجدة",
    "ساعدني من فضلك",
    "बचाओ",
    "助けて",
    "помогите",
  ];
  const calm = [
    "Is this neighbourhood dangerous at night?",
    "can you help me find a pharmacy?",
    "¿me ayudas a encontrar una farmacia?",
    "Ich brauche Hilfe bei der Route",
    "What's the emergency number here?",
    "is it safe to take a taxi in Lagos?",
    "I'm landing in London at 11 PM",
    "What's open nearby?",
    "take me home",
    "je cherche une pharmacie",
  ];
  it.each(danger)("surfaces Emergency for %s", (m) => expect(DANGER.test(m)).toBe(true));
  it.each(calm)("does not for %s", (m) => expect(DANGER.test(m)).toBe(false));
  it("recognises judgement questions and measures verdict words", () => {
    for (const q of ["Is this neighbourhood safe?", "is it safe to take a taxi in Lagos?", "Is Shoreditch dangerous at night?", "what's the crime like here", "¿es seguro caminar aquí?"]) expect(JUDGEMENT.test(q)).toBe(true);
    for (const q of ["take me home", "what's open nearby?", "I'm landing in London at 11 PM"]) expect(JUDGEMENT.test(q)).toBe(false);
    expect(verdictWords("This area is Safe and not dangerous; muy peligroso")).toEqual(["safe", "dangerous", "peligroso"]);
    expect(verdictWords("Here are Help Points near you.")).toEqual([]);
  });
});

describe("Her local time", () => {
  it("uses the IANA zone when the device sends one, else the offset", () => {
    const at = "2026-09-25T22:30:00.000Z"; // a Friday in UTC
    expect(localClock({ localTime: at, tzOffsetMin: 0, tz: "Asia/Tokyo" })).toMatchObject({ hour: 7, minute: 30, weekday: "Saturday", isoDay: 5, timeZone: "Asia/Tokyo", daypart: "dawn" });
    expect(localClock({ localTime: at, tzOffsetMin: 240, tz: "America/New_York" })).toMatchObject({ hour: 18, weekday: "Friday", timeZone: "America/New_York" });
    expect(localClock({ localTime: at, tzOffsetMin: -330, tz: "Not/A_Zone" })).toMatchObject({ hour: 4, minute: 0, weekday: "Saturday", timeZone: null });
  });
});

describe("Mira's context block", () => {
  const facts = (n: MiraNow, email = true) => ({ firstName: "Amara", email, now: n, saved: [{ label: "Home" }], contacts: ["Mum"], trip: null, coverage: coverageLine(false, true) });
  it("carries her time, country and the local emergency line, and never coordinates", () => {
    const block = contextBlock(facts(now({ area: "28.6927, 77.2131" })));
    expect(block).toMatch(/Friday, 10:05 pm \(night\), time zone Europe\/London/);
    expect(block).toMatch(/country: United Kingdom \(GB\)/);
    expect(block).toMatch(/Reviewed call options: 999/);
    // Truthful beside Safety updates: no crime scores or ratings, and news reports are never a verdict.
    expect(block).toMatch(/no crime scores, crime maps or neighbourhood safety ratings anywhere/);
    expect(block).toMatch(/Safety updates: recent news reports .* never a verdict/);
    expect(block).not.toMatch(/no crime, incident or neighbourhood-safety data/);
    expect(coverageLine(false, false)).toMatch(/Safety updates .* are switched off/);
    expect(block).toMatch(/Contact email: on\. .*tries to email .*sending can fail/);
    expect(contextBlock(facts(now(), false))).toMatch(/Contact email: off\. MIRA can't email anyone/);
    expect(block).not.toMatch(/would follow/);
    expect(block).not.toMatch(/\d+\.\d{3,}/); // no coordinates, even when the device sent them as an "area"
    expect(safeArea("Near Gate 3")).toBe("Near Gate 3");
  });
  it("says when MIRA has no profile for the country, and when location is off", () => {
    const ke = contextBlock(facts(now({ country: KE, area: "Westlands" })));
    expect(ke).toMatch(/country: Kenya \(KE\) — MIRA has no reviewed profile/);
    expect(ke).toMatch(/not known to MIRA for KE/);
    const off = contextBlock(facts(now({ hasLocation: false, area: null, country: UNKNOWN_COUNTRY })));
    expect(off).toMatch(/location is off/);
    expect(off).toMatch(/not known to MIRA for this location/);
  });
});

/** A scripted stand-in for the Anthropic client: each call plays the next step. */
function mockClient(steps: Array<{ text?: string; tools?: Array<{ name: string; input: unknown }> }>) {
  const calls: Array<Record<string, unknown>> = [];
  let i = 0;
  const client = {
    messages: {
      stream(params: Record<string, unknown>) {
        calls.push(structuredClone(params));
        const step = steps[i++] ?? { text: "" };
        const uses = (step.tools ?? []).map((t, k) => ({ type: "tool_use", id: `tu_${i}_${k}`, name: t.name, input: t.input }));
        return {
          async *[Symbol.asyncIterator]() {
            if (step.text) yield { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: step.text } };
          },
          finalMessage: async () => ({ content: [...(step.text ? [{ type: "text", text: step.text }] : []), ...uses], stop_reason: uses.length ? "tool_use" : "end_turn", usage: { input_tokens: 1000, output_tokens: 40 } }),
        };
      },
    },
  } as unknown as MiraClient;
  return { client, calls };
}

describe("Mira on Claude (mocked client)", () => {
  it("defaults to Sonnet 5.5 with low effort, and sends the context block without coordinates", async () => {
    expect(DEFAULT_MIRA_MODEL).toBe("claude-sonnet-5-5");
    const { client, calls } = mockClient([{ text: "Hi Amara!" }]);
    const r = await collect(claudeMira({ client, message: "hi", history: [], tools: tools(), firstName: "Amara" }));
    expect(r.text).toBe("Hi Amara!");
    expect(calls[0]).toMatchObject({ model: "claude-sonnet-5-5", output_config: { effort: "low" } });
    const system = JSON.stringify(calls[0].system);
    expect(system).toMatch(/United Kingdom \(GB\)/);
    expect(system).toMatch(/Reviewed call options: 999/);
    expect(system).not.toMatch(/28\.69|77\.21|51\.49|-0\.11/);
    expect(r.events.find((e) => e.type === "usage")).toEqual({ type: "usage", inputTokens: 1000, outputTokens: 40 });
  });

  it("routes find_help_points → help_points card, and propose_trip by ref with a ride mode", async () => {
    const { client, calls } = mockClient([
      { tools: [{ name: "find_help_points", input: { situation: "unsafe" } }] },
      { tools: [{ name: "propose_trip", input: { place_ref: "h1", mode: "ride" } }] },
      { text: "Here's the nearest Help Point." },
    ]);
    const r = await collect(claudeMira({ client, message: "I feel uneasy, get me somewhere staffed", history: [], tools: tools(), firstName: "Amara" }));
    expect(r.cards.map((c) => c.type)).toEqual(["help_points", "trip"]);
    expect(r.cards[1]).toMatchObject({ type: "trip", destination: { name: "St Thomas' Hospital" }, minutes: null, mode: "ride" });
    const helpResult = JSON.stringify((calls[1].messages as unknown[]).at(-1));
    expect(helpResult).toMatch(/Open 24h/);
    expect(helpResult).toMatch(/Google Maps/);
    expect(helpResult).not.toMatch(/51\.49|-0\.118/); // refs, never coordinates
    // A reply about what's around her is saved as a neutral line.
    expect(r.events.find((e) => e.type === "history")).toEqual({ type: "history", text: "I showed you places near you (not saved, for your privacy)." });
  });

  it("get_local_emergency_info returns the Country Context facts (or 'not known') and the Emergency card", async () => {
    const ask = async (country: CountryContext) => {
      const { client, calls } = mockClient([{ tools: [{ name: "get_local_emergency_info", input: {} }] }, { text: "ok" }]);
      const r = await collect(claudeMira({ client, message: "what number do I call here?", history: [], tools: tools({ getContext: async () => now({ country }) }), firstName: "A" }));
      return { r, result: JSON.stringify((calls[1].messages as unknown[]).at(-1)) };
    };
    const uk = await ask(GB);
    expect(uk.r.cards.map((c) => c.type)).toEqual(["sos"]);
    expect(uk.result).toMatch(/999 — Emergency/);
    const ke = await ask(KE);
    expect(ke.result).toMatch(/\\"known\\":false/);
    expect(ke.result).toMatch(/has not yet been verified by MIRA/);
  });

  it("danger words show the Emergency card before the model says anything, once", async () => {
    const { client } = mockClient([{ tools: [{ name: "show_emergency_help", input: {} }] }, { text: "Call 999 now." }]);
    const r = await collect(claudeMira({ client, message: "¡ayuda! me están siguiendo", history: [], tools: tools(), firstName: "A" }));
    expect(r.events[0]).toMatchObject({ type: "card", card: { type: "sos" } });
    expect(r.cards.filter((c) => c.type === "sos")).toHaveLength(1);
  });

  it("rejects a model safety verdict before any unsafe text reaches the user", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { client } = mockClient([{ text: "That area is safe." }]);
    const r = await collect(claudeMira({ client, message: "is Soho safe?", history: [], tools: tools(), firstName: "A" }));
    expect(r.text).not.toContain("That area is safe");
    expect(r.text).toBe("I don't have enough verified information to make that judgement. The cards here show what MIRA can check.");
    const line = warn.mock.calls.map((c) => String(c[0])).find((l) => l.includes("mira.output_rejected"));
    expect(JSON.parse(line!)).toMatchObject({ event: "mira.output_rejected", reason: "safety_verdict" });
    expect(line).not.toMatch(/That area|Soho/);
    warn.mockRestore();
  });
});

describe("Failure never leaves her without a reply", () => {
  it("a Claude error before any text → the scripted reply", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    async function* broken(): AsyncGenerator<MiraEvent> {
      throw Object.assign(new Error("timeout"), { name: "APIConnectionTimeoutError" });
    }
    const r = await collect(withFallback(broken(), () => placeholderMira("take me home", [], tools(), "A")));
    expect(r.text).toMatch(/Let's get you to Home/);
    expect(r.cards.map((c) => c.type)).toEqual(["trip"]);
  });
  it("mid-reply → a short bridge, the scripted answer, and a history line without the half reply", async () => {
    async function* half(): AsyncGenerator<MiraEvent> {
      yield { type: "text", delta: "You're near Gate 3 and" };
      throw new Error("overloaded");
    }
    const r = await collect(withFallback(half(), () => placeholderMira("take me home", [], tools(), "A")));
    expect(r.text).toMatch(/lost my connection.*Let's get you to Home/);
    const hist = r.events.find((e) => e.type === "history");
    expect(hist).toMatchObject({ type: "history" });
    expect((hist as { text: string }).text).not.toMatch(/Gate 3|12-minute/);
  });
});

const RUNNING = { destination: { name: "Home", lat: 28.69, lon: 77.21 }, state: "active", etaAt: new Date(Date.now() + 10 * 60_000).toISOString(), mode: "walk" };

describe("Scripted Mira: asks that must work (hardening)", () => {
  it("take me home: no glued text, and Circle wording that never promises delivery", async () => {
    const r = await run("Take me home");
    expect(r.text).toBe("Let's get you to Home — about a 12-minute walk. MIRA will try to email Mum your live link when you start (sending can fail).");
    expect(r.cards[0]).toMatchObject({ type: "trip", email: true });
    const off = await run("take me home", tools({ proposeTrip: async (d: { name: string }) => ({ destination: d, minutes: 12, contacts: ["Mum"], context: [], mode: "walk", email: false, helpLookupFailed: false }) }));
    expect(off.text).toMatch(/Email isn't switched on, so share your live link yourself after you start\./);
    expect(off.text).not.toMatch(/follow along live|can follow live|will be able to/);
    expect(off.cards[0]).toMatchObject({ type: "trip", email: false });
  });

  it("what do we know about this walk: answers from the running trip, never proposes another", async () => {
    const proposeTrip = vi.fn();
    const r = await run("What do we know about this walk?", tools({ tripStatus: async () => RUNNING, proposeTrip }));
    expect(r.text).toMatch(/^You're on your way to Home, ETA in about (9|10) min\. Lighting and Help Points along the way are on the route sheet/);
    expect(r.cards.map((c) => c.type)).toEqual(["trip_status"]);
    expect(proposeTrip).not.toHaveBeenCalled();
    // Late at night, an unrelated question doesn't add an unrequested Home trip while one is running.
    const late = await run("what's the capital of France?", tools({ tripStatus: async () => RUNNING, proposeTrip }));
    expect(late.cards).toEqual([]);
    expect(proposeTrip).not.toHaveBeenCalled();
  });

  it("a pharmacy near her destination searches around the destination, and says hours only as listed", async () => {
    const findNearby = vi.fn(async () => [{ id: "p", name: "Night Chemist", kind: "Pharmacy", lat: 28.7, lon: 77.2, distanceM: 200, openNow: "open" }]);
    const r = await run("Is there a pharmacy open near my destination?", tools({ tripStatus: async () => RUNNING, findNearby }));
    expect(findNearby).toHaveBeenCalledWith(["pharmacy"], RUNNING.destination);
    expect(r.text).toMatch(/closest pharmacies near Home\. Listed as open now: Night Chemist\./);
    expect(r.cards[0]).toMatchObject({ type: "places", title: "Near Home" });
    const unknownHours = await run("pharmacy near my destination", tools({ tripStatus: async () => RUNNING, findNearby: async () => [{ id: "p", name: "Apollo", kind: "Pharmacy", lat: 1, lon: 1, openNow: "not_known" }] }));
    expect(unknownHours.text).toMatch(/hours aren't known/);
    expect(unknownHours.text).not.toMatch(/open now/i);
    // No trip running: it doesn't pass off places around her as the answer.
    const none = vi.fn();
    const noTrip = await run("Is there a pharmacy open near my destination?", tools({ findNearby: none }));
    expect(none).not.toHaveBeenCalled();
    expect(noTrip.text).toMatch(/don't know where you're headed/);
    expect(noTrip.cards).toEqual([]);
  });

  it("judgement answers never present a service-only number as the emergency number", async () => {
    const JP: CountryContext = { ...GB, iso: "JP", countryName: "Japan", emergency: { ...GB.emergency, status: "VERIFIED", primary: { number: "110", label: "Police", service: "police", scope: "service" }, also: [] } };
    const r = await run("Is this neighbourhood safe?", tools({ getContext: async () => now({ country: JP }) }));
    expect(r.text).not.toMatch(/\b110\b/);
    expect(r.text).toMatch(/Emergency options/);
    expect((await run("Is this neighbourhood safe?")).text).toMatch(/emergency number here is 999/);
  });

  it("share this trip: explains where sharing lives and never claims to have shared", async () => {
    const r = await run("Share this trip with my people", tools({ tripStatus: async () => RUNNING }));
    expect(r.text).toMatch(/can't send anything myself.*"Send my live link"/);
    expect(r.cards.map((c) => c.type)).toEqual(["trip_status"]);
    expect(r.text).not.toMatch(/I(?:'ve| have)? shared|notified|sent it/);
    const none = await run("Share this trip with my people");
    expect(none.text).toMatch(/don't have a journey running/);
    expect(none.cards).toEqual([]);
  });

  it("recent safety updates point to Today, deterministically; reports accept 'something'; failed Help Point lookups say so", async () => {
    const r = await run("Any recent safety updates here?");
    expect(r.text).toMatch(/on Today/);
    expect(r.text).toMatch(/not a verdict/);
    expect((await run("Any recent safety updates here?", tools({ safetyUpdatesOn: () => false }))).text).toMatch(/aren't switched on/);
    expect((await run("I want to report something")).cards[0]).toMatchObject({ type: "report", category: "other" });
    const failed = await run("Find somewhere staffed nearby", tools({ findHelpPoints: async () => ({ points: [], failed: true }) }));
    expect(failed.text).toMatch(/couldn't check Help Points/);
    expect(failed.text).not.toMatch(/no Help Point|none/i);
  });

  it("in danger, no promise about the Circle — the number from the Country Context first", async () => {
    const r = await run("someone is following me");
    expect(r.text).toMatch(/^If you're in danger right now, call 999 now\./);
    expect(r.text).not.toMatch(/straight away|will|can see/);
  });
});

describe("Mira on Claude: hardened tools and the output guard", () => {
  it("a rejected reply in a danger turn keeps the emergency number (and the Emergency card)", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { client } = mockClient([{ text: "Call 911 now and stay safe." }]);
    const r = await collect(claudeMira({ client, message: "someone is following me", history: [], tools: tools(), firstName: "A" }));
    expect(r.text).toBe("If you may be in danger, call 999 now. The Emergency card is on your screen.");
    expect(r.cards.filter((c) => c.type === "sos")).toHaveLength(1);
    // Where MIRA knows no number, the replacement says so instead of inventing one.
    const { client: c2 } = mockClient([{ text: "Call 911 now." }]);
    const ke = await collect(claudeMira({ client: c2, message: "help me!", history: [], tools: tools({ getContext: async () => now({ country: KE }) }), firstName: "A" }));
    expect(ke.text).toMatch(/use the Emergency button now — MIRA doesn't know the local number here/);
    expect(ke.text).not.toMatch(/911/);
  });

  it("a claim split across tool rounds is still caught on the whole reply", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { client } = mockClient([{ text: "Priya", tools: [{ name: "check_trip", input: {} }] }, { text: "has been notified." }]);
    const r = await collect(claudeMira({ client, message: "did you tell Priya?", history: [], tools: tools({ tripStatus: async () => RUNNING }), firstName: "A" }));
    expect(r.text).not.toMatch(/has been notified/);
    expect(r.text).toMatch(/I can't verify that from MIRA's information/);
  });

  it("allows the emergency number with 'somewhere with people around' in a danger turn", async () => {
    const { client } = mockClient([{ text: "Call 999 now and get somewhere with people around." }]);
    const r = await collect(claudeMira({ client, message: "I'm scared", history: [], tools: tools(), firstName: "A" }));
    expect(r.text).toBe("Call 999 now and get somewhere with people around.");
  });

  it("propose_trip gives circle_sharing as an attempt (email on) or a do-it-yourself (email off); the card carries it", async () => {
    const ask = async (email: boolean) => {
      const { client, calls } = mockClient([{ tools: [{ name: "propose_trip", input: { saved_place: "Home" } }] }, { text: "ok" }]);
      const r = await collect(claudeMira({ client, message: "take me home", history: [], tools: tools({ proposeTrip: async (d: { name: string }) => ({ destination: d, minutes: 12, contacts: ["Mum"], context: [], mode: "walk", email, helpLookupFailed: !email }) }), firstName: "A" }));
      return { card: r.cards[0], result: JSON.stringify((calls[1].messages as unknown[]).at(-1)) };
    };
    const on = await ask(true);
    expect(on.result).toMatch(/MIRA will try to email Mum your live link when you start \(sending can fail\)/);
    expect(on.result).not.toMatch(/would_follow|follow along live/);
    expect(on.card).toMatchObject({ type: "trip", email: true });
    const off = await ask(false);
    expect(off.result).toMatch(/Email isn't switched on, so share your live link yourself after you start/);
    expect(off.result).toMatch(/couldn't check Help Points along the way/);
    expect(TOOL_GUIDE).not.toMatch(/Mention who in her Circle would follow along live/);
  });

  it("find_help_points reports a failed lookup as couldn't check, never none", async () => {
    const { client, calls } = mockClient([{ tools: [{ name: "find_help_points", input: { situation: "nearby" } }] }, { text: "ok" }]);
    const r = await collect(claudeMira({ client, message: "help points near me", history: [], tools: tools({ findHelpPoints: async () => ({ points: [], failed: true }) }), firstName: "A" }));
    expect(JSON.stringify((calls[1].messages as unknown[]).at(-1))).toMatch(/lookup_failed.*couldn't check/);
    expect(r.cards).toEqual([]);
  });

  it("find_nearby near the destination searches around the running trip's destination, with open_now from listed hours", async () => {
    const findNearby = vi.fn(async () => [{ id: "p", name: "Night Chemist", kind: "Pharmacy", lat: 28.7, lon: 77.2, distanceM: 200, hours: "Mo-Su 00:00-24:00", openNow: "open" }]);
    const { client, calls } = mockClient([{ tools: [{ name: "find_nearby", input: { kinds: ["pharmacy"], near: "destination" } }] }, { text: "ok" }]);
    const r = await collect(claudeMira({ client, message: "pharmacy open near my destination?", history: [], tools: tools({ tripStatus: async () => RUNNING, findNearby }), firstName: "A" }));
    expect(findNearby).toHaveBeenCalledWith(["pharmacy"], RUNNING.destination);
    const result = JSON.stringify((calls[1].messages as unknown[]).at(-1));
    expect(result).toMatch(/her destination \(Home\), not where she is/);
    expect(result).toMatch(/open_now\\":\\"open/);
    expect(r.cards[0]).toMatchObject({ type: "places", title: "Near Home" });
    // Nothing running and no saved place: an error, not places around her.
    const none = vi.fn();
    const { client: c2, calls: calls2 } = mockClient([{ tools: [{ name: "find_nearby", input: { near: "destination" } }] }, { text: "ok" }]);
    await collect(claudeMira({ client: c2, message: "pharmacy near my destination?", history: [], tools: tools({ findNearby: none }), firstName: "A" }));
    expect(none).not.toHaveBeenCalled();
    expect(JSON.stringify((calls2[1].messages as unknown[]).at(-1))).toMatch(/no destination to search around/);
  });

  it("get_safety_updates is read-only context: couldn't check stays couldn't check", async () => {
    const { client, calls } = mockClient([{ tools: [{ name: "get_safety_updates", input: {} }] }, { text: "ok" }]);
    const r = await collect(claudeMira({ client, message: "any recent safety updates here?", history: [], tools: tools(), firstName: "A" }));
    expect(r.cards).toEqual([]);
    const result = JSON.stringify((calls[1].messages as unknown[]).at(-1));
    expect(result).toMatch(/couldnt_check/);
    expect(result).toMatch(/never say there are none/);
    expect(TOOLS.map((t) => t.name)).toContain("get_safety_updates");
  });

  it("check_trip points to the route sheet; offer_report accepts 'other'", async () => {
    const { client, calls } = mockClient([{ tools: [{ name: "check_trip", input: {} }, { name: "offer_report", input: { category: "other", label: "something that happened" } }] }, { text: "ok" }]);
    const r = await collect(claudeMira({ client, message: "what do we know about this walk? also I want to report something", history: [], tools: tools({ tripStatus: async () => RUNNING }), firstName: "A" }));
    expect(r.cards.map((c) => c.type)).toEqual(["trip_status", "report"]);
    const result = JSON.stringify((calls[1].messages as unknown[]).at(-1));
    expect(result).toMatch(/route sheet/);
    expect(result).not.toMatch(/Invalid input/);
  });
});

describe("Safety updates summary (pure)", () => {
  it("a failed or unavailable check is couldn't check, never none; a ready check gives counts, categories, publisher and age", () => {
    expect(safetyUpdatesSummary({ state: "failed", sources: [], retryable: true }, "Delhi")).toEqual({ status: "couldnt_check", area: "Delhi" });
    expect(safetyUpdatesSummary({ state: "unavailable", sources: [], retryable: false }, null)).toEqual({ status: "couldnt_check", area: null });
    const at = new Date("2026-09-27T12:00:00Z");
    const update: SafetyUpdate = { id: "u1", title: "t", translatedTitle: null, summary: null, category: "transport", reporting: "arrest_reported", reportedLocation: null, locationPrecision: "city", publishedAt: "2026-09-25T09:00:00Z", eventYear: null, publisher: "thehindu.com", originalUrl: "https://x", sourceType: "news", sourceCount: 2, sources: [], sensitive: false, retrievedAt: "2026-09-27T00:00:00Z" };
    const r = safetyUpdatesSummary({ state: "ready", sources: [{ source: "gdelt", state: "ready" }], data: { area: { name: "Delhi", precision: "city", countryIso: "IN", countryName: "India" }, windowDays: 7, updates: [update], counts: { official: 0, news: 1 }, community: "unavailable_in_beta", checkedAt: at.toISOString() } }, "Delhi", at);
    expect(r).toMatchObject({ status: "checked", area: "Delhi", count: 1, partial: false, categories: [{ category: "Transport", updates: 1 }], latest: [{ publisher: "thehindu.com", age_days: 2, reporting: "Arrest reported, not a conviction", sources: 2, official: false }] });
    expect(JSON.stringify(r)).not.toMatch(/"title"|https:/); // no headlines or links go to the model
  });
});
