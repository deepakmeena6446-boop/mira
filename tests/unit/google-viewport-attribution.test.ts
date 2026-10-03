import { afterEach, expect, it, vi } from "vitest";
import { googleAttributionSession, googleViewportUrl, type ViewportAttribution } from "@/components/map/google-viewport-attribution";

const tiles = "https://tile.googleapis.com/v1/2dtiles/{z}/{x}/{y}?session=fictional-session&key=fictional-browser-key";
const view = { north: 1, south: -1, east: -170, west: 170, zoom: 12.9 };
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

it("uses the documented viewport endpoint, current tile session, integer zoom and antimeridian bounds", () => {
  const url = new URL(googleViewportUrl(tiles, view));
  expect(url.origin + url.pathname).toBe("https://tile.googleapis.com/tile/v1/viewport");
  expect(Object.fromEntries(url.searchParams)).toEqual({ session: "fictional-session", key: "fictional-browser-key", north: "1", south: "-1", east: "-170", west: "170", zoom: "12" });
  const world = new URL(googleViewportUrl(tiles, { ...view, west: -200, east: 200 }));
  expect(world.searchParams.get("west")).toBe("-179.999999");
  expect(world.searchParams.get("east")).toBe("179.999999");
  expect(() => googleViewportUrl("https://other.invalid/tiles?key=fake&session=fake", view)).toThrow();
  expect(() => googleViewportUrl(tiles, { ...view, north: NaN })).toThrow();
});

it("discards older camera responses, aborts them, and preserves the entire current copyright", async () => {
  const pending: Array<{ resolve: (response: Response) => void; signal: AbortSignal }> = [];
  vi.stubGlobal("fetch", vi.fn((_url, init) => new Promise<Response>((resolve) => pending.push({ resolve, signal: init.signal }))));
  const states: ViewportAttribution[] = [];
  const session = googleAttributionSession(tiles, (s) => states.push(s));
  const old = session.refresh(view);
  const fresh = session.refresh({ ...view, zoom: 13 });
  expect(pending[0].signal.aborted).toBe(true);
  pending[1].resolve(Response.json({ copyright: "Map data ©2026 Google, Fictional data vendor\nAnother vendor" }));
  await fresh;
  pending[0].resolve(Response.json({ copyright: "Stale vendor" }));
  await old;
  expect(states.at(-1)).toEqual({ status: "ready", copyright: "Map data ©2026 Google, Fictional data vendor\nAnother vendor" });
  session.invalidate();
  expect(states.at(-1)).toEqual({ status: "pending" });
  session.dispose();
});

it.each([Response.json({ copyright: "" }), new Response("quota", { status: 429 }), Response.json({ unrelated: "text" })])("fails closed on missing copyright or failed provider action", async (response) => {
  vi.stubGlobal("fetch", vi.fn(async () => response));
  const states: ViewportAttribution[] = [];
  const session = googleAttributionSession(tiles, (s) => states.push(s));
  await session.refresh(view);
  expect(states).toEqual([{ status: "pending" }, { status: "unavailable" }]);
  session.dispose();
});

it("bounds a stalled request and rejects late completion after timeout or disposal", async () => {
  vi.useFakeTimers();
  let resolve!: (value: Response) => void;
  const fetch = vi.fn((_url, init) => new Promise<Response>((r) => { resolve = r; expect(init.cache).toBe("no-store"); expect(init.credentials).toBe("omit"); }));
  vi.stubGlobal("fetch", fetch);
  const states: ViewportAttribution[] = [];
  const session = googleAttributionSession(tiles, (s) => states.push(s), 100);
  const request = session.refresh(view);
  await vi.advanceTimersByTimeAsync(100);
  expect(states.at(-1)).toEqual({ status: "unavailable" });
  expect(fetch.mock.calls[0][1].signal.aborted).toBe(true);
  resolve(Response.json({ copyright: "Too late" }));
  await request;
  expect(states.at(-1)).toEqual({ status: "unavailable" });
  const disposed = session.refresh(view);
  session.dispose();
  resolve(Response.json({ copyright: "After unmount" }));
  await disposed;
  expect(states.at(-1)).toEqual({ status: "pending" });
});
