/**
 * Time of day, from the device's local clock. Drives the app theme (dawn → day →
 * evening → night), Home's greeting and Mira's tone. Pure so the client theme, the
 * pre-paint script and Mira's server-side context always agree.
 */
export type Daypart = "dawn" | "day" | "evening" | "night";

/** Hour boundaries (local, 0–23): dawn 5–8, day 8–17, evening 17–20, night 20–5. */
export function daypartFor(hour: number): Daypart {
  if (hour >= 5 && hour < 8) return "dawn";
  if (hour >= 8 && hour < 17) return "day";
  if (hour >= 17 && hour < 20) return "evening";
  return "night";
}

/** Browser-chrome color per daypart (matches `--color-canvas` in globals.css). */
export const DAYPART_THEME_COLOR: Record<Daypart, string> = {
  dawn: "#f7f3ec",
  day: "#f7f3ec",
  evening: "#f7f3ec",
  night: "#14111d",
};

export type ThemePref = "auto" | "light" | "dark";

/** What actually renders: "auto" follows the clock; "light" uses day; "dark" uses night. */
export function effectiveDaypart(hour: number, pref: ThemePref): Daypart {
  if (pref === "light") return "day";
  if (pref === "dark") return "night";
  return daypartFor(hour);
}

export const THEME_PREF_KEY = "mira.theme";

/**
 * Runs before first paint (inlined in <head>) so there's no flash of the wrong theme.
 * Kept dependency-free and in sync with `effectiveDaypart` (a unit test checks both).
 */
export const DAYPART_BOOT_SCRIPT = `(function(){try{var h=new Date().getHours(),p="auto";try{p=localStorage.getItem("${THEME_PREF_KEY}")||"auto"}catch(e){}var d=p==="light"?"day":p==="dark"?"night":h>=5&&h<8?"dawn":h>=8&&h<17?"day":h>=17&&h<20?"evening":"night";document.documentElement.dataset.daypart=d;var c=${JSON.stringify(DAYPART_THEME_COLOR)};var m=document.querySelector('meta[name="theme-color"]');if(!m){m=document.createElement("meta");m.name="theme-color";document.head.appendChild(m)}m.content=c[d];}catch(e){}})();`;
