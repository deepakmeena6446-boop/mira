import { describe, expect, it } from "vitest";
import { CATALOG, greetingKey, translate } from "@/lib/i18n";

describe("language groundwork", () => {
  it("has a Hindi string for every English key, never empty, and no verdict words", () => {
    expect(Object.keys(CATALOG.hi).sort()).toEqual(Object.keys(CATALOG.en).sort());
    for (const v of Object.values(CATALOG.hi)) expect(v.trim().length).toBeGreaterThan(0);
    for (const [k, v] of Object.entries(CATALOG.en)) if (k !== "support.unsafe") expect(v).not.toMatch(/\b(safe|unsafe|dangerous)\b/i);
  });
  it("greets by the hour in the same bands as English", () => {
    expect([3, 9, 14, 20, 23].map((h) => translate("en", greetingKey(h)))).toEqual(["Still up", "Good morning", "Good afternoon", "Good evening", "Good evening"]);
    expect(translate("hi", greetingKey(9))).toBe("सुप्रभात");
  });
});
