import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

describe("client bundle audit", () => {
  it("fails closed when the static directory has no client code", () => {
    const dir = mkdtempSync(join(tmpdir(), "mira-bundle-audit-"));
    try {
      const staticDir = join(dir, ".next", "static");
      mkdirSync(staticDir, { recursive: true });
      writeFileSync(join(staticDir, "empty.txt"), "no client files");
      const result = spawnSync(process.execPath, [resolve("scripts/audit-bundle.mjs")], { cwd: dir, encoding: "utf8" });
      expect(result.status).toBe(2);
      expect(result.stderr).toContain("no JavaScript or CSS client assets");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
