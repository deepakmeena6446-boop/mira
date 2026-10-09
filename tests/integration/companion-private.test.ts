import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("next/headers", async () => (await import("../helpers/cookie-jar")).nextHeadersMock);

// The reply engine is replaced at the route boundary so the test sees exactly which context reaches it.
const seen = vi.hoisted(() => ({ calls: [] as Array<{ message: string; history: Array<{ role: string; text: string }> }> }));
vi.mock("@/server/providers/companion", async (original) => ({
  ...(await original<typeof import("@/server/providers/companion")>()),
  respond: async function* (_sql: unknown, _user: unknown, message: string, history: Array<{ role: string; text: string }>) {
    seen.calls.push({ message, history: structuredClone(history) });
    const earlier = history.find((t) => t.role === "user" && /Hauz Khas/.test(t.text));
    yield { type: "text", delta: earlier && /Science Faculty/.test(message) ? "Got it: dinner near Science Faculty, not Hauz Khas. When are you going?" : "Okay." };
    yield { type: "done" };
  },
}));

import { POST as demoPOST } from "@/app/api/auth/demo/route";
import { POST as miraPOST, GET as miraGET } from "@/app/api/mira/route";
import { newJar, switchJar } from "../helpers/cookie-jar";
import { jsonRequest } from "../helpers/http";

const ctx = () => ({ localTime: new Date().toISOString(), tzOffsetMin: -330, location: null });
const post = async (body: Record<string, unknown>) => {
  const r = await miraPOST(jsonRequest("/api/mira", { context: ctx(), ...body }));
  const text = (await r.text()).trim().split("\n").map((l) => JSON.parse(l)).filter((e) => e.type === "text").map((e) => e.delta).join("");
  return { status: r.status, mode: r.headers.get("x-mira-history"), text };
};
const stored = async () => ((await (await miraGET()).json()).messages as Array<{ text: string }>).map((m) => m.text);

// Sprint mira-companion-48h review (issues 2 and 3): a conversation that starts private stays private, and its
// follow-ups keep their context from the client's memory — never from, or into, stored chat history.
describe("signed-in private conversation", () => {
  beforeEach(async () => {
    seen.calls = [];
    switchJar(newJar());
    expect((await demoPOST(jsonRequest("/api/auth/demo", { name: "Private" }))).status).toBe(201);
  });

  it("keeps a movement question and its clarification out of history, with the first turn as context for the second", async () => {
    // An unrelated saved chat exists first; it must not leak into the private conversation's context.
    expect((await post({ message: "How do I add someone to my Circle?" })).mode).toBe("saved");
    const before = await stored();
    expect(before).toHaveLength(2);

    // Exactly what MiraChat sends: the first movement turn enters private mode before the request (empty context)…
    const first = await post({ message: "I am going to dinner at Hauz Khas.", plan: null, ephemeral: true, history: [] });
    expect(first.mode).toBe("not_saved");
    // …and the clarification carries only this conversation's turns, held in the screen's memory.
    const second = await post({ message: "I mean near Science Faculty.", plan: null, ephemeral: true, history: [{ role: "user", text: "I am going to dinner at Hauz Khas." }, { role: "assistant", text: first.text }] });
    expect(second.mode).toBe("not_saved");
    expect(second.text).toBe("Got it: dinner near Science Faculty, not Hauz Khas. When are you going?");

    expect(seen.calls.map((c) => c.history.map((t) => t.text))).toEqual([
      [], // the saved turn reads her stored history (empty for a new account)
      [], // the private conversation starts with no context: stored chats aren't mixed in
      ["I am going to dinner at Hauz Khas.", "Okay."],
    ]);
    expect(JSON.stringify(seen.calls.slice(1))).not.toMatch(/Circle/);
    expect(await stored()).toEqual(before); // zero rows written by either private turn
  });

  it("treats a signed-in request that carries its own context as private even without the flag", async () => {
    const r = await post({ message: "I mean near Science Faculty.", history: [{ role: "user", text: "I am going to dinner at Hauz Khas." }] });
    expect(r.mode).toBe("not_saved");
    expect(await stored()).toEqual([]);
  });

  it("keeps the existing size limits on private context", async () => {
    const tooMany = Array.from({ length: 9 }, () => ({ role: "user", text: "x" }));
    expect((await post({ message: "and then?", ephemeral: true, history: tooMany })).status).toBe(400);
    const tooLong = [{ role: "user", text: "x".repeat(2001) }];
    expect((await post({ message: "and then?", ephemeral: true, history: tooLong })).status).toBe(400);
    expect(await stored()).toEqual([]);
  });
});
