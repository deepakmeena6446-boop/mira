import { describe, expect, it, vi } from "vitest";
import { jsonRequest } from "../helpers/http";

const providers = vi.hoisted(() => ({ googleSearch: vi.fn(), osmSearch: vi.fn() }));
vi.mock("@/server/providers/geo", () => ({ getGeo: () => ({ search: providers.googleSearch }) }));
vi.mock("@/server/providers/geo/placeholder", () => ({ placeholderGeo: () => ({ search: providers.osmSearch }) }));

import { POST } from "@/app/api/geo/search/route";

describe("Phase 2 planned-place provider rights", () => {
  it("keeps a planned search on OSM sources, even with a Google provider configured", async () => {
    providers.googleSearch.mockReset();
    providers.osmSearch.mockReset().mockResolvedValue([{ id: "osm:n/1", name: "Gate", kind: "entrance", lat: 28.7, lon: 77.2 }]);
    const response = await POST(jsonRequest("/api/geo/search", { q: "Gate", near: null, deep: true, source: "osm" }));
    expect(response.status).toBe(200);
    expect((await response.json()).places[0].id).toBe("osm:n/1");
    expect(providers.osmSearch).toHaveBeenCalledWith("Gate", undefined, { deep: false });
    expect(providers.googleSearch).not.toHaveBeenCalled();
  });
});
