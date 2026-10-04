// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CountryContext } from "@/domain/country-context";

const INDIA = { iso: "IN", countryName: "India", emergency: { primary: { number: "112" } } } as unknown as CountryContext;
const DELHI = { lat: 28.6951, lon: 77.2143 };

async function store() {
  vi.resetModules(); // a fresh module = a cold open of the app
  return import("@/lib/locale-store");
}

describe("the emergency country survives what used to drop it (audit P0-1)", () => {
  beforeEach(() => { localStorage.clear(); vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-04T21:05:00+05:30")); });
  afterEach(() => vi.useRealTimers());

  it("keeps India after the 2-minute fresh window and across a cold open, and says when it was confirmed", async () => {
    const s = await store();
    s.setCountry(INDIA, { point: DELHI, checkedAt: Date.now() });
    expect(s.currentCountry().iso).toBe("IN");
    expect(s.countryConfirmedAt()).toBeNull(); // fresh, no label needed
    vi.advanceTimersByTime(3 * 60_000); // standing still past COUNTRY_FRESH_MS
    expect(s.currentCountry().iso).toBe("IN");
    expect(s.countryConfirmedAt()).not.toBeNull();

    const cold = await store(); // e.g. Journeys opened straight from the home screen
    expect(cold.currentCountry().iso).toBe("IN");
    expect(cold.currentCountry()).toBe(cold.currentCountry()); // stable snapshot for useSyncExternalStore
  });

  it("a failed or moved lookup drops only the fresh state, not the remembered country", async () => {
    const s = await store();
    s.setCountry(INDIA, { point: DELHI, checkedAt: Date.now() });
    s.clearCountry();
    expect(s.currentCountry().iso).toBe("IN");
  });

  it("stops trusting it after 24 h, or when the clock moved backwards", async () => {
    const s = await store();
    s.setCountry(INDIA, { point: DELHI, checkedAt: Date.now() });
    const saved = { country: INDIA, checkedAt: Date.now() };
    expect(s.lastKnownCountry(saved, Date.now() + 23 * 3600_000)).toBe(INDIA);
    expect(s.lastKnownCountry(saved, Date.now() + 24 * 3600_000)).toBeNull();
    expect(s.lastKnownCountry(saved, Date.now() - 5 * 60_000)).toBeNull();
    expect(s.lastKnownCountry(null, Date.now())).toBeNull();
  });

  it("is forgotten on sign-out/delete", async () => {
    const s = await store();
    s.setCountry(INDIA, { point: DELHI, checkedAt: Date.now() });
    s.forgetLastKnownCountry();
    s.clearCountry();
    expect(s.currentCountry().iso).toBeNull();
    expect((await store()).currentCountry().iso).toBeNull();
  });
});

describe("the label says when, not just a time", () => {
  it("reads minutes, today or yesterday", async () => {
    const { confirmedWhen } = await import("@/components/app/EmergencyPill");
    const now = new Date("2026-10-04T10:00:00").getTime();
    expect(confirmedWhen(now - 3 * 60_000, now)).toBe("3 min ago");
    expect(confirmedWhen(new Date("2026-10-04T08:15:00").getTime(), now)).toBe("today at 8:15 AM");
    expect(confirmedWhen(new Date("2026-10-03T21:05:00").getTime(), now)).toBe("yesterday at 9:05 PM");
  });
});
