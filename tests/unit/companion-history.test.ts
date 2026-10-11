import { describe, expect, it } from "vitest";
import { keepTurn, storableCard } from "@/server/providers/companion/history";

// Audit F2: chat history never outlives a journey — no turn is kept while one exists, and trip_status cards (which
// name the destination) are never stored.
describe("chat history rules", () => {
  const base = { signedIn: true, message: "How long is left on my journey?", plan: null, location: null };
  it("keeps an ordinary signed-in turn, but not one taken while a journey of hers exists", () => {
    expect(keepTurn(base)).toBe(true);
    expect(keepTurn({ ...base, journey: true })).toBe(false);
  });
  it("never stores a card that names where she is or is going", () => {
    expect(storableCard({ type: "trip_status", destination: "Hostel", etaAt: "2026-10-11T18:00:00Z", state: "active" })).toBeNull();
  });
});
