// Launch-UX accessibility checks (docs tooling). Against `mira-verify` on :3150:
//   node docs/launch-ux/tools/a11y-checks.mjs
// Y-4: text-token contrast ≥ 4.5:1 on canvas and surface, day and night (WCAG formula on computed colours).
// Y-5: interactive targets ≥ 44×44 px — inline links inside running text are exempt (WCAG 2.2 SC 2.5.8).
// Keyboard: every screen's first Tab stop is the skip link, and focus is visible (outline width > 0).
import { chromium } from "playwright";

const BASE = process.env.MIRA_BASE ?? "http://localhost:3150";
const results = [];
const check = (id, ok, detail = "") => {
  results.push({ id, ok });
  console.log(`${ok ? "PASS" : "FAIL"} ${id}${detail ? ` — ${detail}` : ""}`);
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, geolocation: { latitude: 28.6951, longitude: 77.2143 }, permissions: ["geolocation"], extraHTTPHeaders: { "x-forwarded-for": `10.77.${Math.floor(Math.random() * 200)}.9` } });
const page = await ctx.newPage();
await page.goto(`${BASE}/welcome`);
await page.getByRole("button", { name: "Continue", exact: true }).click();
await page.getByRole("button", { name: "Use my location" }).click();
await page.waitForURL((u) => u.pathname === "/");
await page.getByRole("button", { name: "Sign in" }).first().click();
await page.getByPlaceholder("Your first name").fill("Asha");
await page.getByRole("dialog").getByRole("checkbox", { name: /18 or older/ }).check();
await page.getByRole("button", { name: "Continue", exact: true }).click();
await page.waitForTimeout(2000);

for (const part of ["day", "night"]) {
  await page.goto(`${BASE}/me`);
  await page.evaluate((p) => (document.documentElement.dataset.daypart = p), part);
  const pairs = await page.evaluate(() => {
    const css = getComputedStyle(document.documentElement);
    const v = (n) => css.getPropertyValue(n).trim();
    const lum = (hex) => {
      let c = hex.replace("#", "");
      if (c.length === 3) c = [...c].map((x) => x + x).join("");
      const [r, g, b] = [0, 2, 4].map((i) => parseInt(c.slice(i, i + 2), 16) / 255).map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const ratio = (a, b) => {
      const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
      return (x + 0.05) / (y + 0.05);
    };
    const out = [];
    for (const fg of ["--color-ink", "--color-ink-muted", "--color-ink-subtle", "--color-accent-strong", "--color-warm", "--color-error"])
      for (const bg of ["--color-canvas", "--color-surface"]) out.push([`${fg} on ${bg}`, ratio(v(fg), v(bg))]);
    out.push(["--color-accent-ink on --color-accent", ratio(v("--color-accent-ink"), v("--color-accent"))]);
    out.push(["--color-warm on --color-warm-soft", ratio(v("--color-warm"), v("--color-warm-soft"))]);
    out.push(["--color-accent-strong on --color-accent-soft", ratio(v("--color-accent-strong"), v("--color-accent-soft"))]);
    return out;
  });
  for (const [name, r] of pairs) check(`Y-4 ${part} ${name}`, r >= 4.5, r.toFixed(2));
}

for (const path of ["/", "/mira", "/trips", "/contribute", "/report", "/me", "/circle", "/inbox"]) {
  await page.goto(`${BASE}${path}`);
  await page.waitForTimeout(2500);
  const small = await page.evaluate(() => {
    const els = [...document.querySelectorAll("button, a[href], [role=radio], [role=switch], input[type=checkbox]")];
    return els
      .filter((el) => {
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height || getComputedStyle(el).visibility === "hidden") return false;
        if (el.closest(".maplibregl-ctrl, .maplibregl-ctrl-attrib")) return false; // the map library's own attribution control
        if (el.classList.contains("sr-only")) return false; // the skip link: full size when focused
        if (el.tagName === "INPUT" && el.closest("label")) return false; // the whole label is the target
        const inline = el.tagName === "A" && el.parentElement && ["P", "SPAN", "LI", "SUMMARY"].includes(el.parentElement.tagName) && getComputedStyle(el).display === "inline";
        if (inline) return false; // an inline link in running text (SC 2.5.8 inline exception)
        return r.width < 43.5 || r.height < 43.5;
      })
      .map((el) => `${el.tagName.toLowerCase()} "${(el.getAttribute("aria-label") ?? el.textContent ?? "").trim().slice(0, 30)}" ${Math.round(el.getBoundingClientRect().width)}×${Math.round(el.getBoundingClientRect().height)}`);
  });
  check(`Y-5 ${path} targets ≥ 44 px`, small.length === 0, small.join("; "));
  await page.keyboard.press("Tab");
  const first = await page.evaluate(() => ({ text: document.activeElement?.textContent?.trim(), outline: getComputedStyle(document.activeElement).outlineWidth }));
  check(`Keyboard ${path} skip link first, focus visible`, first.text === "Skip to content" && first.outline !== "0px", JSON.stringify(first));
}
await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
