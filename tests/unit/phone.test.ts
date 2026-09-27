import { describe, expect, it } from "vitest";
import { E164, checkOnMeMessage, journeyMessage, normalizePhone, phoneHint, whatsappLink } from "@/domain/phone";

describe("normalizePhone: what she types → E.164", () => {
  it("completes a local number with her country's code", () => {
    expect(normalizePhone("98765 43210", "+91")).toBe("+919876543210");
    expect(normalizePhone("98765-43210", "+91")).toBe("+919876543210");
  });
  it("drops the national trunk 0 before adding the country code", () => {
    expect(normalizePhone("098765 43210", "+91")).toBe("+919876543210");
    expect(normalizePhone("(020) 7946 0958", "+44")).toBe("+442079460958");
  });
  it("keeps an international number as typed, from any country", () => {
    expect(normalizePhone("+91 98765-43210", "+44")).toBe("+919876543210");
    expect(normalizePhone("0091 9876543210", "+91")).toBe("+919876543210"); // 00 = international prefix
    expect(normalizePhone("+44 (0)20 7946 0958", "+91")).toBe("+442079460958"); // "(0)" is a trunk 0 written inside
  });
  it("accepts an international number when her country isn't known, and refuses a local one", () => {
    expect(normalizePhone("+1 415 555 0132", null)).toBe("+14155550132");
    expect(normalizePhone("415 555 0132", null)).toBeNull();
  });
  it("refuses anything that can't be a reachable number", () => {
    for (const bad of ["", "   ", "abc", "12", "+0 123 456 789", "+91 98765 43210 98765 43210", "9876x43210", "call me"]) {
      expect(normalizePhone(bad, "+91"), bad).toBeNull();
    }
  });
  it("always returns E.164 or null", () => {
    for (const input of ["98765 43210", "+1 415 555 0132", "0091 9876543210", "(020) 7946 0958"]) {
      const out = normalizePhone(input, "+44");
      expect(out === null || E164.test(out), input).toBe(true);
    }
  });
});

describe("WhatsApp links", () => {
  it("open a chat with the message ready, and never carry anything but the number and the text", () => {
    const url = whatsappLink("+919876543210", journeyMessage("https://mira.test/t/abc", "Kamla Nagar Market", "walk"));
    expect(url).toBe(`https://wa.me/919876543210?text=${encodeURIComponent("I'm walking to Kamla Nagar Market. Follow along live on MIRA until I arrive: https://mira.test/t/abc")}`);
    expect(new URL(url).searchParams.get("text")).toContain("https://mira.test/t/abc");
  });
  it("word sharing-where-I-am and check-on-me in her voice, without alarm", () => {
    expect(journeyMessage("https://mira.test/t/x", null)).toBe("Here's where I am. Follow along live on MIRA until I stop sharing: https://mira.test/t/x");
    expect(checkOnMeMessage("https://mira.test/t/x")).toMatch(/^Can you check on me\?/);
    expect(checkOnMeMessage("https://mira.test/t/x")).not.toMatch(/\b(SOS|emergency|danger|safe)\b/i);
  });
  it("show a number as a hint, never the whole number", () => {
    expect(phoneHint("+919876543210")).toBe("+91 •••• ••3210");
  });
});
