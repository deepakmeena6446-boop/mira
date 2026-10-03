// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { clearLocation, currentLocation, freshLocation, locationUsable, rememberLocationChoice, requestLocation, shouldAutoLocate, watchWhileVisible, type LocState } from "@/lib/location-store";
import { clearCountry, currentCountry, invalidateCountryForLocation, setCountry } from "@/lib/locale-store";
import { UNKNOWN_COUNTRY, type CountryContext } from "@/domain/country-context";
const london = { lat: 51.47, lon: -0.45 };
const profile: CountryContext = { ...UNKNOWN_COUNTRY, iso: "GB", countryName: "United Kingdom", timezone: "Europe/London", emergency: { ...UNKNOWN_COUNTRY.emergency, status: "VERIFIED", primary: { number: "999", label: "Emergency", scope: "all" } } };
afterEach(() => { clearLocation(); clearCountry(); localStorage.clear(); vi.useRealTimers(); vi.unstubAllGlobals(); });
describe("current location and emergency jurisdiction", () => {
  it("forces a new browser fix on explicit retry instead of reusing a cached wrong origin", async () => {
    let next = london;
    const cached = london;
    const acquire = vi.fn((ok: (pos: unknown) => void, _error: unknown, options: PositionOptions) => {
      const chosen = options.maximumAge === 0 ? next : cached;
      ok({ coords: { latitude: chosen.lat, longitude: chosen.lon, accuracy: 10 }, timestamp: Date.now() });
    });
    vi.stubGlobal("navigator", { geolocation: { getCurrentPosition: acquire } });
    expect((await requestLocation()).point).toMatchObject(london);
    setCountry(profile, { point: london, checkedAt: Date.now() });
    next = { lat: 35.68, lon: 139.76 };
    expect((await requestLocation()).point).toMatchObject(next);
    expect(currentCountry().iso).toBeNull();
    expect(acquire).toHaveBeenCalledTimes(2);
    for (const call of acquire.mock.calls) expect(call[2]).toEqual({ enableHighAccuracy: true, timeout: 12_000, maximumAge: 0 });
  });
  it("requires explicit location consent, independently of the old onboarding flag", () => {
    localStorage.clear(); expect(shouldAutoLocate()).toBe(false);
    localStorage.setItem("mira.welcomed", "1"); expect(shouldAutoLocate()).toBe(false);
    localStorage.removeItem("mira.welcomed"); rememberLocationChoice(true); expect(shouldAutoLocate()).toBe(true);
    rememberLocationChoice(false); expect(shouldAutoLocate()).toBe(false);
  });
  it("rejects denied, stale, inaccurate and future-dated coordinates", () => {
    const loc: LocState = { status: "ok", point: { ...london, accuracy: 10 }, at: 1_000_000, area: null };
    expect(locationUsable(loc, { at: 1_000_001 })).toBe(true);
    expect(locationUsable({ ...loc, status: "denied" }, { at: 1_000_001 })).toBe(false);
    expect(locationUsable(loc, { at: 1_120_000 })).toBe(false);
    expect(locationUsable({ ...loc, point: { ...london, accuracy: 101 } }, { at: 1_000_001 })).toBe(false);
    expect(locationUsable(loc, { at: 900_000 })).toBe(false);
  });
  it("never turns a remote country profile into a current dial action, expires it and invalidates movement", () => {
    vi.useFakeTimers(); vi.setSystemTime(1_000_000);
    setCountry(profile); expect(currentCountry().emergency.primary).toBeNull();
    setCountry(profile, { point: london, checkedAt: Date.now() }); expect(currentCountry().iso).toBe("GB");
    invalidateCountryForLocation({ lat: 35.68, lon: 139.76 }); expect(currentCountry().iso).toBeNull();
    setCountry(profile, { point: london, checkedAt: Date.now() }); vi.advanceTimersByTime(120_000); expect(currentCountry().emergency.primary).toBeNull();
  });
  it("does not reuse the earlier point or country after permission denial", async () => {
    let denied = false;
    vi.stubGlobal("navigator", { geolocation: { getCurrentPosition: (ok: (pos: unknown) => void, error: (err: unknown) => void) => denied ? error({ code: 1, PERMISSION_DENIED: 1 }) : ok({ coords: { latitude: london.lat, longitude: london.lon, accuracy: 10 }, timestamp: Date.now() }) } });
    expect((await requestLocation()).point).not.toBeNull();
    setCountry(profile, { point: london, checkedAt: Date.now() }); denied = true;
    const next = await requestLocation(); expect(next.status).toBe("denied"); expect(next.point).toBeNull(); expect(currentCountry().iso).toBeNull();
  });
  it("ignores a location response which arrives after personal state was cleared", async () => {
    let answer: (pos: unknown) => void = () => {};
    vi.stubGlobal("navigator", { geolocation: { getCurrentPosition: (ok: (pos: unknown) => void) => { answer = ok; } } });
    const pending = requestLocation(); clearLocation();
    answer({ coords: { latitude: london.lat, longitude: london.lon, accuracy: 10 }, timestamp: Date.now() });
    expect((await pending).point).toBeNull(); expect(currentLocation().status).toBe("idle");
  });
  it("refreshes stationary fixes from their actual timestamp and refuses old provider fixes", async () => {
    vi.useFakeTimers(); vi.setSystemTime(1_000_000);
    let watch: (pos: unknown) => void = () => {};
    vi.stubGlobal("navigator", { geolocation: { getCurrentPosition: (ok: (pos: unknown) => void) => ok({ coords: { latitude: london.lat, longitude: london.lon, accuracy: 10 }, timestamp: Date.now() }), watchPosition: (ok: (pos: unknown) => void) => { watch = ok; return 1; }, clearWatch: vi.fn() } });
    await requestLocation(); const stop = watchWhileVisible(); vi.advanceTimersByTime(90_000);
    watch({ coords: { latitude: london.lat, longitude: london.lon, accuracy: 10 }, timestamp: Date.now() });
    // The next explicit action reuses the stationary current fix rather than querying again.
    const loc = await freshLocation(); expect(loc.at).toBe(Date.now());
    watch({ coords: { latitude: london.lat, longitude: london.lon, accuracy: 10 }, timestamp: Date.now() - 180_000 });
    expect(currentLocation().point).toBeNull();
    stop();
  });
});
