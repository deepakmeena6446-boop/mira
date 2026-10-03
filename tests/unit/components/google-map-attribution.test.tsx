// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

const maps = vi.hoisted(() => ({ instances: [] as Array<{ emit: (name: string) => void }> }));
vi.mock("@/lib/daypart-store", () => ({ useDaypart: () => "day" }));
vi.mock("maplibre-gl", () => ({
  setWorkerUrl: vi.fn(),
  Map: class {
    handlers = new Map<string, Array<() => void>>();
    touchZoomRotate = { disableRotation: vi.fn() };
    constructor() { maps.instances.push(this); }
    on(name: string, fn: () => void) { this.handlers.set(name, [...(this.handlers.get(name) ?? []), fn]); }
    once(name: string, fn: () => void) { this.on(name, fn); }
    emit(name: string) { this.handlers.get(name)?.forEach((fn) => fn()); }
    addSource() {}
    addLayer() {}
    getSource() { return { setData: vi.fn() }; }
    getLayer() { return null; }
    getBounds() { return { getNorth: () => 1, getSouth: () => -1, getEast: () => 1, getWest: () => -1 }; }
    getZoom() { return 12; }
    setPadding() {}
    resize() {}
    remove() {}
  },
}));

import { WorldMap } from "@/components/map/WorldMap";
const tiles = { url: "https://tile.googleapis.com/v1/2dtiles/{z}/{x}/{y}?session=fictional-session&key=fictional-key", provider: "google", attribution: "" };
beforeEach(() => {
  maps.instances.length = 0;
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const show = async (config = tiles) => {
  render(<WorldMap tiles={config} me={null} label="Fictional route map" />);
  await act(async () => {});
  await act(async () => maps.instances[0].emit("load"));
};

it("hides Google content until the entire returned copyright is shown, and hides it again as the camera changes", async () => {
  let finish!: (response: Response) => void;
  const fetch = vi.fn(() => new Promise<Response>((resolve) => { finish = resolve; }));
  vi.stubGlobal("fetch", fetch);
  await show();
  const region = screen.getByRole("region", { hidden: true });
  expect(region).toHaveStyle({ visibility: "hidden" });
  expect(screen.queryByAltText("Google Maps")).toBeNull();
  const completeCredit = "Map data ©2026 Google, Fictional provider, another provider";
  await act(async () => finish(Response.json({ copyright: completeCredit })));
  expect(region).toHaveStyle({ visibility: "visible" });
  expect(screen.getByText(completeCredit)).toBeInTheDocument();
  expect(screen.getByAltText("Google Maps")).toBeInTheDocument();
  await act(async () => maps.instances[0].emit("movestart"));
  expect(region).toHaveStyle({ visibility: "hidden" });
  expect(screen.queryByText(completeCredit)).toBeNull();
  await act(async () => maps.instances[0].emit("moveend"));
  expect(fetch).toHaveBeenCalledTimes(2);
});

it("keeps tiles hidden on provider failure and lets an explicit retry reveal only a credited map", async () => {
  const fetch = vi.fn().mockResolvedValueOnce(new Response("quota", { status: 429 })).mockResolvedValueOnce(Response.json({ copyright: "Map data ©2026 Fictional vendor" }));
  vi.stubGlobal("fetch", fetch);
  await show();
  expect(screen.getByRole("region", { hidden: true })).toHaveStyle({ visibility: "hidden" });
  expect(screen.getByText(/Map unavailable/)).toBeInTheDocument();
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Retry map" })));
  expect(screen.getByRole("region")).toHaveStyle({ visibility: "visible" });
  expect(screen.getByText("Map data ©2026 Fictional vendor")).toBeInTheDocument();
});

it("does not issue viewport requests for a non-Google basemap", async () => {
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  await show({ url: "https://fictional-tiles.invalid/{z}/{x}/{y}", provider: "raster", attribution: "Fictional test map" });
  expect(fetch).not.toHaveBeenCalled();
  expect(screen.getByRole("region")).toHaveStyle({ visibility: "visible" });
});
