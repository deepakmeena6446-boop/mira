import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { companionAvailability } from "@/domain/companion";

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : /\.(tsx?|css)$/.test(f) ? [p] : [];
  });
}

describe("companion boundary", () => {
  it("is not available in V0", () => {
    expect(companionAvailability()).toEqual({ available: false, reason: "not_verified" });
  });
  it("exposes no call/companion route, control or phone-call claim in the app", () => {
    const appFiles = files("src/app").concat(files("src/components"));
    expect(appFiles.some((f) => /companion|call-me|stay-with-me/i.test(f))).toBe(false);
    for (const f of appFiles) {
      const src = readFileSync(f, "utf8");
      expect(src, f).not.toMatch(/Call Me|Stay with me|tel:|someone is listening|we'?re listening/i);
    }
  });
});
