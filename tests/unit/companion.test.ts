import { describe, expect, it } from "vitest";
import { placeholderMira } from "@/server/providers/companion/placeholder";
import { MIRA_PERSONA } from "@/server/providers/companion/persona";
import type { MiraEvent } from "@/server/providers/companion/types";
import type { MiraTools } from "@/server/providers/companion/tools";

const home = { id: "h", label: "Home", emoji: "🏠", lat: 28.69, lon: 77.21, address: null };

function tools(over: Partial<Record<keyof MiraTools, unknown>> = {}): MiraTools {
  return {
    getContext: async () => ({ hour: 22, late: true, area: "Near Gate 3", hasLocation: true }),
    listSavedPlaces: async () => [home],
    findNearby: async (kinds?: string[]) => (kinds?.includes("pharmacy") ? [{ id: "p", name: "Apollo Pharmacy", kind: "Pharmacy", lat: 28.69, lon: 77.21, distanceM: 120 }] : []),
    proposeTrip: async (d: { name: string; lat: number; lon: number }) => ({ destination: d, minutes: 12, contacts: ["Mum"] }),
    tripStatus: async () => null,
    trustedContacts: async () => ["Mum"],
    ...over,
  } as unknown as MiraTools;
}

async function run(msg: string, t = tools()) {
  let text = "";
  const cards: unknown[] = [];
  for await (const ev of placeholderMira(msg, [], t, "Priya") as AsyncGenerator<MiraEvent>) {
    if (ev.type === "text") text += ev.delta;
    if (ev.type === "card") cards.push(ev.card);
  }
  return { text, cards: cards as Array<{ type: string }> };
}

describe("Mira (placeholder engine)", () => {
  it("proposes a trip home — never starts one by itself", async () => {
    const r = await run("take me home");
    expect(r.text).toMatch(/Home/);
    expect(r.cards.map((c) => c.type)).toEqual(["trip"]);
  });
  it("points to 112 first when someone is in danger", async () => {
    const r = await run("someone is following me, I'm scared");
    expect(r.text).toMatch(/call 112/);
    expect(r.cards[0].type).toBe("sos");
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
    expect(r.text).toMatch(/still learning/);
    const who = await run("who are you?");
    expect(who.text).toMatch(/not an emergency service/);
    expect(MIRA_PERSONA).toMatch(/Never claim to be human/);
    expect(MIRA_PERSONA).toMatch(/call 112/);
    expect(MIRA_PERSONA).toMatch(/Never start a trip or send anything without the person tapping to confirm/);
  });
});
