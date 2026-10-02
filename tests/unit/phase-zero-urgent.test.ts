import { describe, expect, it, vi } from "vitest";
import { placeholderMira } from "@/server/providers/companion/placeholder";
import type { MiraTools } from "@/server/providers/companion/tools";

describe("Phase 0 urgent path baseline", () => {
  it("surfaces the Emergency card before context, places, or a model answer", async () => {
    const getContext = vi.fn(async () => new Promise<never>(() => {}));
    const listSavedPlaces = vi.fn(async () => []);
    const findHelpPoints = vi.fn(async () => ({ points: [], failed: false }));
    const tools = { trustedContacts: async () => [], getContext, listSavedPlaces, findHelpPoints } as unknown as MiraTools;
    const stream = placeholderMira("someone is following me", [], tools, "Tester");
    expect((await stream.next()).value).toEqual({ type: "card", card: { type: "sos", contacts: [] } });
    expect(getContext).not.toHaveBeenCalled();
    expect(listSavedPlaces).not.toHaveBeenCalled();
    expect(findHelpPoints).not.toHaveBeenCalled();
    await stream.return({ type: "done" });
  });
});
