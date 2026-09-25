import { describe, expect, it } from "vitest";
import { rankPlaces, textScore } from "@/domain/search-rank";

const near = { lat: 28.6951, lon: 77.2143 }; // North Campus
const hit = (id: string, name: string, lat: number, lon: number) => ({ id, name, kind: "Place", lat, lon });

describe("Where to? ranking", () => {
  it("scores exact > prefix > all words > partial", () => {
    expect(textScore("India Gate", "india gate")).toBe(0);
    expect(textScore("India Gate Park", "India Gate")).toBe(1);
    expect(textScore("Metro Gate No. 3, India", "india gate")).toBe(2);
    expect(textScore("State Bank of India", "India Gate")).toBeGreaterThan(2);
  });

  it("puts what you typed ahead of a closer partial match", () => {
    const out = rankPlaces([hit("sbi", "State Bank of India", 28.699, 77.21), hit("ig", "India Gate", 28.6129, 77.2295)], "India Gate", near);
    expect(out.map((h) => h.id)).toEqual(["ig", "sbi"]);
  });

  it("drops far-away namesakes and merges duplicates from different sources", () => {
    const out = rankPlaces(
      [hit("agra", "Kamla Nagar Market", 27.2, 78.0), hit("a", "Khan Market", 28.6003, 77.2270), hit("b", "Khan Market", 28.6004, 77.2271), hit("km", "Kamla Nagar Market", 28.681, 77.206)],
      "Kamla Nagar Market",
      near,
    );
    expect(out[0].id).toBe("km"); // the exact name wins
    expect(out.map((h) => h.id)).not.toContain("agra"); // the 180 km namesake is dropped
    expect(rankPlaces([hit("a", "Khan Market", 28.6003, 77.227), hit("b", "Khan Market", 28.6004, 77.2271)], "Khan Market", near)).toHaveLength(1);
  });

  it("keeps partial matches when people type extra words", () => {
    expect(rankPlaces([hit("t3", "Terminal 3 (International)", 28.556, 77.087)], "IGI Airport Terminal 3", near)).toHaveLength(1);
  });
});

describe("Google route polyline", () => {
  it("decodes Google's encoded polyline format into [lon, lat] pairs", async () => {
    const { decodePolyline } = await import("@/server/providers/geo/google");
    // Google's documented example: (38.5,-120.2), (40.7,-120.95), (43.252,-126.453)
    expect(decodePolyline("_p~iF~ps|U_ulLnnqC_mqNvxq`@")).toEqual([
      [-120.2, 38.5],
      [-120.95, 40.7],
      [-126.453, 43.252],
    ]);
  });
});
