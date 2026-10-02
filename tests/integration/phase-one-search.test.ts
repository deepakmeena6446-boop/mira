import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getSql } from "@/server/db/client";
import { resetEnvCache } from "@/server/config/env";
import { POST as searchPOST } from "@/app/api/geo/search/route";
import { loadFixturePilot } from "../helpers/pilot";
import { jsonRequest } from "../helpers/http";
import { newJar, switchJar } from "../helpers/cookie-jar";

describe("Phase 1 guest named-place resolution", () => {
  const originalPlaceSearchUrl = process.env.PLACE_SEARCH_URL;
  const originalReverseGeocoderUrl = process.env.REVERSE_GEOCODER_URL;
  beforeAll(async () => {
    process.env.PLACE_SEARCH_URL = "";
    process.env.REVERSE_GEOCODER_URL = "";
    resetEnvCache();
    await loadFixturePilot(getSql());
  });
  afterAll(() => {
    if (originalPlaceSearchUrl === undefined) delete process.env.PLACE_SEARCH_URL;
    else process.env.PLACE_SEARCH_URL = originalPlaceSearchUrl;
    if (originalReverseGeocoderUrl === undefined) delete process.env.REVERSE_GEOCODER_URL;
    else process.env.REVERSE_GEOCODER_URL = originalReverseGeocoderUrl;
    resetEnvCache();
  });

  it("searches a remote origin without session or device coordinates", async () => {
    switchJar(newJar());
    const req = jsonRequest("/api/geo/search", { q: "Fixture Pharmacy", near: null, deep: true });
    expect(new URL(req.url).search).toBe("");
    const response = await searchPOST(req);
    expect(response.status).toBe(200);
    const { places } = await response.json();
    expect(places).toEqual(expect.arrayContaining([expect.objectContaining({ name: "Fixture Pharmacy" })]));
    expect(JSON.stringify(places)).not.toContain("userId");
  });

  it("returns zero candidates without claiming the place does not exist", async () => {
    switchJar(newJar());
    const response = await searchPOST(jsonRequest("/api/geo/search", { q: "Unfindable Synthetic Place 987654321", near: null, deep: true }));
    expect(response.status).toBe(200);
    expect((await response.json()).places).toEqual([]);
  });
});
