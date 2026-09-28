import { describe, expect, it } from "vitest";
import { parseReportFrom, reportGroupOrder } from "@/lib/report-groups";

describe("report tile groups — order by entry point (06 §3.13)", () => {
  it("after a journey, from I feel unsafe or Mira: what happened first", () => {
    for (const from of ["journey", "unsafe", "mira"] as const) expect(reportGroupOrder(from, null)[0]).toBe("happened");
  });
  it("from Contribute, the map, Home, Me or nowhere: the street first", () => {
    for (const from of ["contribute", "map", "home", "me", null] as const) expect(reportGroupOrder(from, null)[0]).toBe("street");
  });
  it("an incident preset leads with what happened; a street preset with the street", () => {
    expect(reportGroupOrder(null, "harassment")[0]).toBe("happened");
    expect(reportGroupOrder("contribute", "environment")[0]).toBe("street");
  });
  it("ignores unknown or malicious values", () => {
    expect(parseReportFrom("contribute")).toBe("contribute");
    expect(parseReportFrom("<script>")).toBeNull();
    expect(parseReportFrom(["map"])).toBeNull();
  });
});
