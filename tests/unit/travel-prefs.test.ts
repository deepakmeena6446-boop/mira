import { describe, expect, it } from "vitest";
import { applyPrefsPatch, journeyNoun, modeWords, parseTravelPrefs, travelPrefsPatchSchema, travelPrefsSchema } from "@/domain/travel-prefs";
import { tripStartExtras, suggestionQuery } from "@/lib/trip-start";
import { journeyVerb, tripMissedEmail, tripSharedEmail, inviteEmail } from "@/server/mail/templates";

describe("travel preferences (explicit only)", () => {
  it("accepts only known keys and values", () => {
    expect(travelPrefsSchema.parse({ mode: "transit", shareByDefault: true })).toEqual({ mode: "transit", shareByDefault: true });
    expect(travelPrefsSchema.parse({})).toEqual({});
    expect(travelPrefsSchema.safeParse({ mode: "other" }).success).toBe(false); // "other" is a journey, not a preference
    expect(travelPrefsSchema.safeParse({ mode: "auto" }).success).toBe(false);
    expect(travelPrefsSchema.safeParse({ avoidHelpClasses: ["police"] }).success).toBe(false); // lives in users.help_exclude
    expect(travelPrefsSchema.safeParse({ homeArea: "x" }).success).toBe(false);
  });

  it("patches: null clears, undefined keeps, rememberHabits is separate", () => {
    expect(applyPrefsPatch({ mode: "walk", shareByDefault: false }, { mode: null })).toEqual({ shareByDefault: false });
    expect(applyPrefsPatch({ mode: "walk" }, { shareByDefault: true })).toEqual({ mode: "walk", shareByDefault: true });
    expect(applyPrefsPatch({ mode: "walk" }, { rememberHabits: false })).toEqual({ mode: "walk" });
    expect(travelPrefsPatchSchema.safeParse({ rememberHabits: "no" }).success).toBe(false);
    expect(travelPrefsPatchSchema.safeParse({ mode: "ride", extra: 1 }).success).toBe(false);
  });

  it("reads stored JSON tolerantly, dropping anything unknown", () => {
    expect(parseTravelPrefs({ mode: "ride", shareByDefault: true, secret: "x" })).toEqual({ mode: "ride", shareByDefault: true });
    expect(parseTravelPrefs({ mode: "hover", shareByDefault: "yes" })).toEqual({});
    expect(parseTravelPrefs(null)).toEqual({});
    expect(parseTravelPrefs("walk")).toEqual({});
  });

  it("says modes in global words, never assuming walking", () => {
    expect(modeWords("walk").short).toBe("walking");
    expect(modeWords("ride").short).toBe("by car or taxi");
    expect(modeWords("transit").short).toBe("by transit");
    expect(modeWords("other").phrase).toBe("");
    expect(modeWords(undefined).label).toBe("Other");
    expect(journeyNoun("walk")).toBe("walk");
    expect(journeyNoun("ride")).toBe("ride");
    expect(journeyNoun("transit")).toBe("trip");
    expect(journeyVerb("walk")).toBe("is walking to");
    expect(journeyVerb("ride")).toBe("is on the way by car or taxi to");
    expect(journeyVerb("transit")).toBe("is on the way by transit to");
    expect(journeyVerb("other")).toBe("is on the way to");
  });
});

describe("trip start extras (from the phone)", () => {
  it("sends the phone's zone and local start hour, and the saved place only when there is one", () => {
    const at = new Date(2026, 8, 26, 21, 30);
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    expect(tripStartExtras(undefined, at)).toEqual({ tz, startHour: 21 });
    expect(tripStartExtras("11111111-1111-4111-8111-111111111111", at)).toEqual({ tz, startHour: 21, savedPlaceId: "11111111-1111-4111-8111-111111111111" });
    expect(tripStartExtras(null, at)).not.toHaveProperty("savedPlaceId");
    expect(suggestionQuery(undefined, at)).toBe("?hour=21");
    expect(suggestionQuery("walk", at)).toBe("?hour=21&mode=walk");
  });
});

describe("contact emails use the traveller's zone, labelled", () => {
  const eta = new Date("2026-07-01T01:05:00Z");
  it("shows the ETA in her zone with its abbreviation", () => {
    const ny = tripSharedEmail({ contactName: "Jo", ownerName: "Emma", destination: "Home", minutesToEta: 18, liveUrl: "https://mira.test/t/x", mode: "ride", etaAt: eta, tz: "America/New_York" });
    expect(ny.text).toContain("They expect to arrive in about 18 minutes (around 9:05 pm EDT, their time).");
    expect(ny.text).toContain("Emma is on the way by car or taxi to Home");
    const london = tripMissedEmail({ ownerName: "Emma", destination: "Home", minutesLate: 12, liveUrl: null, etaAt: eta, tz: "Europe/London" });
    expect(london.text).toContain("about 12 minutes ago (around 2:05 am BST, their time)");
  });
  it("falls back to UTC, labelled — never a hardcoded IST", () => {
    const m = tripSharedEmail({ contactName: "Jo", ownerName: "Emma", destination: "Home", minutesToEta: 18, liveUrl: "https://mira.test/t/x", etaAt: eta, tz: null });
    expect(m.text).toContain("(around 1:05 am UTC, their time)");
    expect(m.text).toContain("Emma is walking to Home"); // mode omitted = legacy walk
    const inv = inviteEmail({ acceptUrl: "https://mira.test/invite/x", etaAt: eta, expiresAt: eta });
    expect(inv.text).toContain("1 Jul, 1:05 am UTC");
    expect(inv.text).not.toMatch(/IST/);
    expect(inviteEmail({ acceptUrl: "u", etaAt: eta, expiresAt: eta, tz: "Asia/Kolkata" }).text).toContain("1 Jul, 6:35 am IST");
  });
});
