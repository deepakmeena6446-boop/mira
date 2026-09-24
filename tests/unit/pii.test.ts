import { describe, expect, it } from "vitest";
import { detectPii, normaliseNarrative, piiFlags, redact, codePointLength } from "@/domain/report/text";

const types = (t: string) => detectPii(t).map((s) => s.type);

describe("deterministic PII detection", () => {
  it.each([
    ["call me on 98765 43210", "phone"],
    ["his number +91-9876543210 keeps texting", "phone"],
    ["mail abc.xyz@gmail.com", "email"],
    ["car was DL 3C AB 1234", "vehicle_plate"],
    ["auto number DL1RT4567 stopped", "vehicle_plate"],
    ["see instagram @some_guy_99", "social_handle"],
    ["check www.example.com/profile", "url"],
    ["near house no. 42 in the lane", "address"],
    ["pin code 110007 area", "address"],
    ["gali no 5 ke paas", "address"],
    ["मकान नंबर 12 के पास", "address"],
    ["his name is Rahul Sharma", "possible_name"],
    ["uska naam Rohit tha", "possible_name"],
    ["उसका नाम राकेश था", "possible_name"],
    ["aadhaar 1234 5678 9012", "id_number"],
    ["फोन ९८७६५४३२१० पर", "phone"],
  ])("flags %s", (text, type) => {
    expect(types(text)).toContain(type);
  });

  it.each([
    "A man kept staring near the metro gate around 9",
    "Streetlight near the bus stop was not working for 2 days",
    "मेट्रो गेट के पास अंधेरा था",
    "bahut bheed thi 5 minute tak",
    "It happened at 10:30 pm near the college",
  ])("does not flag ordinary text: %s", (text) => {
    expect(detectPii(text)).toEqual([]);
  });

  it("redacts spans and records only types and counts", () => {
    const t = "call 9876543210 or mail a@b.co";
    const spans = detectPii(t);
    expect(redact(t, spans)).toBe("call [removed] or mail [removed]");
    const flags = piiFlags(spans);
    expect(flags).toEqual(expect.arrayContaining([{ type: "phone", count: 1 }, { type: "email", count: 1 }]));
    expect(JSON.stringify(flags)).not.toContain("9876");
  });

  it("normalises without translating or dropping Hindi text", () => {
    const n = normaliseNarrative("  रात को​   यहाँ  अंधेरा था \n\n\n\nok  ");
    expect(n).toBe("रात को यहाँ अंधेरा था \n\nok");
    expect(codePointLength("अंधेरा")).toBe(6);
  });
});
