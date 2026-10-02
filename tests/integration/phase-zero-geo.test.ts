import { beforeEach, describe, expect, it, vi } from "vitest";

const geo = vi.hoisted(() => ({
  routes: vi.fn(),
  helpPlacesEvidence: vi.fn(),
}));
vi.mock("@/server/providers/geo", () => ({ getGeo: () => geo }));

import { POST as routePOST } from "@/app/api/geo/route/route";
import { jsonRequest } from "../helpers/http";

const from = { lat: 28.6901, lon: 77.2111 };
const to = { lat: 28.6927, lon: 77.2131 };

describe("Phase 0 route failure baseline", () => {
  beforeEach(() => {
    geo.routes.mockReset();
    geo.helpPlacesEvidence.mockReset();
    geo.helpPlacesEvidence.mockResolvedValue({ state: "empty", data: [], sources: [{ source: "fixture map", state: "ready" }] });
  });

  it("returns a null transit route when the provider has no service evidence", async () => {
    geo.routes.mockResolvedValue([]);
    const req = jsonRequest("/api/geo/route", { from, to, mode: "transit" });
    expect(new URL(req.url).search).toBe(""); // exact positions stay in the POST body
    const response = await routePOST(req);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ mode: "transit", route: null, arrivalHelp: [], arrivalEvidence: { state: "empty" } });
  });

  it("reports a provider failure as an error rather than a no-route result", async () => {
    geo.routes.mockRejectedValue(new Error("synthetic provider outage"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const response = await routePOST(jsonRequest("/api/geo/route", { from, to, mode: "transit" }));
      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({ error: { code: "server_error", message: "Something went wrong on our side. Please try again." } });
      expect(JSON.stringify(log.mock.calls)).not.toMatch(/28\.6901|77\.2111|synthetic provider outage/);
    } finally {
      log.mockRestore();
    }
  });
});
