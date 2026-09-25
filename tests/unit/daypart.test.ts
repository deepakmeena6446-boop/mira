import { describe, expect, it } from "vitest";
import { DAYPART_BOOT_SCRIPT, DAYPART_THEME_COLOR, daypartFor, effectiveDaypart, type ThemePref } from "@/domain/daypart";

/** Runs the pre-paint script against a fake document/clock and returns what it set. */
function boot(hour: number, pref: ThemePref | null) {
  const dataset: Record<string, string> = {};
  const meta = { name: "", content: "" };
  const document = {
    documentElement: { dataset },
    querySelector: () => null,
    createElement: () => meta,
    head: { appendChild: () => {} },
  };
  const localStorage = { getItem: () => pref };
  class FakeDate {
    getHours() {
      return hour;
    }
  }
  new Function("document", "localStorage", "Date", DAYPART_BOOT_SCRIPT)(document, localStorage, FakeDate);
  return { daypart: dataset.daypart, color: meta.content };
}

describe("time-of-day theme", () => {
  it("splits the day into dawn, day, evening and night", () => {
    const at = (h: number) => daypartFor(h);
    expect([4, 5, 7, 8, 16, 17, 19, 20, 23, 0].map(at)).toEqual(["night", "dawn", "dawn", "day", "day", "evening", "evening", "night", "night", "night"]);
  });

  it("lets people pin light or dark instead of following the clock", () => {
    expect(effectiveDaypart(23, "light")).toBe("day");
    expect(effectiveDaypart(12, "dark")).toBe("night");
    expect(effectiveDaypart(18, "auto")).toBe("evening");
  });

  it("the pre-paint script agrees with the app for every hour and preference", () => {
    for (let h = 0; h < 24; h++) {
      for (const pref of ["auto", "light", "dark"] as const) {
        const want = effectiveDaypart(h, pref);
        expect(boot(h, pref === "auto" ? null : pref), `${h}h ${pref}`).toEqual({ daypart: want, color: DAYPART_THEME_COLOR[want] });
      }
    }
  });
});
