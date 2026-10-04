import { describe, expect, it } from "vitest";
import { journeyNextAction } from "@/lib/trip-actions";

const base = { missed: false, whatsapp: [] as string[], opened: [] as string[], following: 0, canShare: true };

describe("journeyNextAction — one filled button on the journey screen", () => {
  it("sends the link to the first WhatsApp contact not yet opened", () => {
    expect(journeyNextAction({ ...base, whatsapp: ["Priya", "Mum"], opened: ["Priya"] })).toEqual({ kind: "whatsapp", id: "Mum" });
  });
  it("with nobody following and no WhatsApp contacts, sending the live link comes first", () => {
    expect(journeyNextAction(base)).toEqual({ kind: "share" });
  });
  it("once people can follow (or every chat was opened), it's I'm here", () => {
    expect(journeyNextAction({ ...base, following: 1 })).toEqual({ kind: "arrive" });
    expect(journeyNextAction({ ...base, whatsapp: ["Priya"], opened: ["Priya"] })).toEqual({ kind: "arrive" });
  });
  it("a missed check-in always leads with I'm here", () => {
    expect(journeyNextAction({ ...base, missed: true, whatsapp: ["Priya"] })).toEqual({ kind: "arrive" });
  });
  it("without a shareable link there's nothing to send: I'm here", () => {
    expect(journeyNextAction({ ...base, canShare: false })).toEqual({ kind: "arrive" });
  });
});
