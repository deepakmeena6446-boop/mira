import { describe, expect, it } from "vitest";
import { notesClaim } from "@/lib/brief";

describe("a failed notes check is never shown as 'no notes' (audit L06-004)", () => {
  it("says it couldn't check, as a failed claim", () => {
    const c = notesClaim("failed", "around you");
    expect(c.kind).toBe("failed");
    expect(c.claim).toMatch(/couldn.t check/);
    expect(c.claim).not.toMatch(/No released/);
  });
  it("keeps the honest empty answer for a check that answered", () => {
    expect(notesClaim([], "around you")).toMatchObject({ kind: "nodata" });
    expect(notesClaim(null)).toMatchObject({ kind: "pending" });
  });
});
