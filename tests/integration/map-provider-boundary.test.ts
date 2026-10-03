import { describe, expect, it, vi } from "vitest";
import { jsonRequest } from "../helpers/http";

const providers = vi.hoisted(() => ({ googleRoutes: vi.fn(), osmRoutes: vi.fn() }));
vi.mock("@/server/providers/geo", () => ({ getGeo: (source?: "osm") => ({
  routes: source === "osm" ? providers.osmRoutes : providers.googleRoutes,
  helpPlacesEvidence: async () => ({ state: "empty", data: [], sources: [{ source: "fixture", state: "ready" }] }),
}) }));

import { POST } from "@/app/api/geo/route/route";

describe("fallback-map provider boundary", () => {
  it("does not request a Google route when the client is showing OSM tiles", async () => {
    providers.googleRoutes.mockReset();
    providers.osmRoutes.mockReset().mockResolvedValue([]);
    const response = await POST(jsonRequest("/api/geo/route", { from: { lat: 28.69, lon: 77.21 }, to: { lat: 28.70, lon: 77.22 }, mode: "transit", source: "osm" }));
    expect(response.status).toBe(200);
    expect((await response.json()).route).toBeNull();
    expect(providers.osmRoutes).toHaveBeenCalledOnce();
    expect(providers.googleRoutes).not.toHaveBeenCalled();
  });
});
