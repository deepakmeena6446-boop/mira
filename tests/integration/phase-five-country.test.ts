import { describe, expect, it } from "vitest";
import { jsonRequest } from "../helpers/http";
import { POST } from "@/app/api/plan/country/route";

describe("Phase 5 selected destination country", () => {
  it("returns sourced full, partial and unknown coverage without a fallback number", async () => {
    const full = await POST(jsonRequest("/api/plan/country", { iso: "IN" }));
    const partial = await POST(jsonRequest("/api/plan/country", { iso: "GH" }));
    const unknown = await POST(jsonRequest("/api/plan/country", { iso: "AF" }));
    expect(full.status).toBe(200);
    expect(full.headers.get("cache-control")).toBe("no-store");
    expect((await full.json()).emergency).toMatchObject({ status: "VERIFIED", source: { url: expect.stringMatching(/^https:/) } });
    expect((await partial.json()).emergency).toMatchObject({ status: "PARTIALLY_VERIFIED", limitations: expect.any(Array) });
    expect((await unknown.json()).emergency).toMatchObject({ status: "UNVERIFIED", primary: null, source: null });
  });

  it("rejects an unknown country code rather than guessing", async () => {
    const response = await POST(jsonRequest("/api/plan/country", { iso: "ZZ" }));
    expect(response.status).toBe(404);
  });
});
