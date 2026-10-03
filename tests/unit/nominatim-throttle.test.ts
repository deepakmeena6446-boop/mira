import { afterEach, beforeEach, expect, it, vi } from "vitest";

vi.mock("@/server/config/env", () => ({ getEnv: () => ({ REVERSE_GEOCODER_URL: "https://fictional-geocoder.invalid", APP_BASE_URL: "http://localhost:3300" }) }));
beforeEach(() => { vi.resetModules(); vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-03T12:00:00Z")); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

it("reserves different start times for simultaneous explicit searches and shares the gate with reverse requests", async () => {
  const starts: number[] = [];
  const fetch = vi.fn<typeof globalThis.fetch>(async (url) => {
    starts.push(Date.now());
    return Response.json(String(url).includes("/reverse") ? { address: { country_code: "gb", city: "Fictional City" } } : []);
  });
  vi.stubGlobal("fetch", fetch);
  const { nominatimSearch, osmArea } = await import("@/server/providers/geo/osm-reverse");
  const first = nominatimSearch("First fictional gate");
  const second = nominatimSearch("Second fictional gate");
  const excess = nominatimSearch("Third fictional gate");
  expect(await excess).toEqual([]); // the third slot exceeds the bounded wait
  expect(await osmArea({ lat: 0, lon: 0 })).toBeNull(); // a reserved search owns the next slot
  expect(fetch).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(999);
  expect(fetch).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1);
  await Promise.all([first, second]);
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(starts[1] - starts[0]).toBe(1000);
  expect(await osmArea({ lat: 0, lon: 0 })).toBeNull();
  await vi.advanceTimersByTimeAsync(1000);
  expect(await osmArea({ lat: 0, lon: 0 })).toMatchObject({ name: "Fictional City", country: "GB" });
  expect(starts[2] - starts[1]).toBe(1000);
});
