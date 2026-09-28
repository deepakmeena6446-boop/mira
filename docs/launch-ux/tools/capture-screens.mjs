// Launch-UX screenshot capture (docs tooling; not app code, not run in CI).
// Usage (from the repo root, with `mira-verify` running on :3150 — see .claude/launch.json):
//   node docs/launch-ux/tools/capture-screens.mjs <outDir> <day|night> [mobile,desktop]
//   ASK_MIRA=1 also sends one message to Mira (uses the configured companion provider).
// "day" pins the Light theme (localStorage mira.theme); "night" follows the real clock, so run it after dark
// or force it with the Me → Appearance → Dark pin. Creates a first-name test account ("Asha") on the local
// build, saves Kamla Nagar as Home, starts and completes one journey, and files one private test report.
// Headless Chromium may not paint the Google raster basemap; overlays still render (see 01 header).
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.env.MIRA_BASE ?? "http://localhost:3150";
const OUT = process.argv[2];
const THEME = process.argv[3] ?? "day"; // day | night
mkdirSync(OUT, { recursive: true });
const GEO = { latitude: 28.6951, longitude: 77.2143 };
const ip = () => `10.${1 + Math.floor(Math.random() * 250)}.${1 + Math.floor(Math.random() * 250)}.${1 + Math.floor(Math.random() * 250)}`;
const log = (...a) => console.log(JSON.stringify(a));
// The sheet handle exists on phones only (desktop is a side panel).
const resize = async (page) => {
  const h = page.getByRole("button", { name: /Resize panel/ });
  if (await h.isVisible().catch(() => false)) await h.click();
};

async function ctxFor(browser, kind) {
  const mobile = kind === "mobile";
  const ctx = await browser.newContext({
    viewport: mobile ? { width: 390, height: 844 } : { width: 1366, height: 900 },
    deviceScaleFactor: mobile ? 2 : 1,
    isMobile: mobile,
    hasTouch: mobile,
    geolocation: GEO,
    permissions: ["geolocation"],
    locale: "en-IN",
    timezoneId: "Asia/Kolkata",
    extraHTTPHeaders: { "x-forwarded-for": ip() },
  });
  return ctx;
}

async function shot(page, name, opts = {}) {
  await page.waitForTimeout(opts.wait ?? 1200);
  try {
    await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: Boolean(opts.full) });
    log("shot", name);
  } catch (e) {
    log("shot-fail", name, String(e).slice(0, 200));
  }
}
async function step(name, fn) {
  try {
    await fn();
  } catch (e) {
    log("step-fail", name, String(e).slice(0, 300));
  }
}

const browser = await chromium.launch();
for (const kind of process.argv[4] ? process.argv[4].split(",") : ["mobile", "desktop"]) {
  const ctx = await ctxFor(browser, kind);
  const page = await ctx.newPage();
  if (THEME === "day") await ctx.addInitScript(() => { try { localStorage.setItem("mira.theme", "light"); } catch {} });
  const p = (n) => `${kind}-${THEME}-${n}`;

  await step("welcome", async () => {
    await page.goto(`${BASE}/`);
    await page.waitForURL("**/welcome", { timeout: 15000 });
    await shot(page, p("01-welcome-1"));
    await shot(page, p("01-welcome-1-full"), { full: true });
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await shot(page, p("02-welcome-2"));
    await page.getByRole("button", { name: "Use my location" }).click();
    await page.waitForURL((u) => u.pathname === "/", { timeout: 15000 });
  });
  await step("home-signed-out", async () => {
    await shot(page, p("03-home-signedout-peek"), { wait: 6000 });
    await resize(page);
    await resize(page);
    await shot(page, p("04-home-signedout-full"), { wait: 1500 });
    await resize(page);
  });
  await step("unsafe-signed-out", async () => {
    await page.getByRole("button", { name: "I feel unsafe" }).first().click();
    await shot(page, p("05-unsafe-sheet-signedout"), { wait: 2500 });
    await page.keyboard.press("Escape");
    await page.getByRole("dialog").getByRole("button", { name: "Close" }).first().click({ timeout: 2000 }).catch(() => {});
  });
  await step("emergency", async () => {
    const pill = page.getByRole("link", { name: /Emergency call/ }).first();
    log("emergency-href", await pill.getAttribute("href", { timeout: 3000 }).catch(() => null));
    const btn = page.getByRole("button", { name: /Emergency options/ }).first();
    if (await btn.isVisible().catch(() => false)) {
      await btn.click();
      await shot(page, p("06-emergency-options"));
      await page.keyboard.press("Escape");
    }
  });
  await step("help-near", async () => {
    await page.getByRole("button", { name: /Help Points near me/ }).click();
    await shot(page, p("07-help-near-sheet"), { wait: 3000 });
    await page.keyboard.press("Escape");
    await page.getByRole("dialog").getByRole("button", { name: /Close/ }).first().click({ timeout: 2000 }).catch(() => {});
  });
  await step("search", async () => {
    await page.getByRole("button", { name: /Search a place or address/ }).click();
    await shot(page, p("08-search-empty"));
    await page.getByPlaceholder("Search a place or address").fill("Vishwavidyalaya Metro");
    await shot(page, p("09-search-results"), { wait: 3500 });
    await page.getByRole("dialog", { name: "Where to?" }).getByRole("button").filter({ hasText: /Vishwavidyalaya/ }).first().click();
    await shot(page, p("10-route-sheet-signedout"), { wait: 9000 });
    await resize(page);
    await shot(page, p("11-route-sheet-signedout-full"), { wait: 1500 });
    await page.getByRole("region", { name: /Route to/ }).getByRole("button", { name: "Close" }).first().click();
  });
  await step("longpress", async () => {
    const box = page.viewportSize();
    await page.mouse.move(box.width / 2, 300);
    await page.mouse.down();
    await page.waitForTimeout(900);
    await page.mouse.up();
    await shot(page, p("12-longpress-card"), { wait: 2500 });
    await page.getByRole("dialog", { name: "This spot" }).getByRole("button", { name: "Close" }).click({ timeout: 3000 }).catch(() => {});
  });
  await step("signin", async () => {
    await page.getByRole("button", { name: "Sign in" }).first().click();
    await shot(page, p("13-signin-sheet"));
    await page.getByPlaceholder("Your first name").fill("Asha");
    await page.getByRole("dialog").getByRole("checkbox", { name: /18 or older/ }).check();
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page.waitForTimeout(2500);
    await page.goto(`${BASE}/`);
  });
  await step("home-signed-in", async () => {
    await shot(page, p("14-home-signedin-peek"), { wait: 6000 });
  });
  await step("save-home+route", async () => {
    await page.getByRole("button", { name: /Search a place or address/ }).click();
    await page.getByPlaceholder("Search a place or address").fill("Kamla Nagar");
    await page.waitForTimeout(3500);
    await page.getByRole("dialog", { name: "Where to?" }).getByRole("button").filter({ hasText: /Kamla/ }).first().click();
    await page.waitForTimeout(8000);
    await page.getByRole("button", { name: "🏠 Home" }).click();
    await shot(page, p("15-route-sheet-signedin"), { wait: 2000 });
    await resize(page);
    await shot(page, p("16-route-sheet-signedin-full"), { wait: 1500 });
  });
  await step("start-trip", async () => {
    await page.getByRole("button", { name: /Go with Mira/ }).click();
    await page.waitForURL("**/trip", { timeout: 20000 });
    await shot(page, p("17-trip-active-half"), { wait: 6000 });
    await resize(page);
    await shot(page, p("18-trip-active-full"), { wait: 1500 });
    await resize(page);
    await resize(page);
  });
  await step("trip-unsafe", async () => {
    await page.getByRole("button", { name: "I feel unsafe" }).click();
    await shot(page, p("19-trip-unsafe-sheet"), { wait: 2500 });
    await page.keyboard.press("Escape");
  });
  await step("shared-view", async () => {
    const r = await page.request.get(`${BASE}/api/trips/current`);
    const j = await r.json();
    const url = j?.trip?.shareUrl;
    log("shareUrl?", Boolean(url));
    if (url) {
      const viewer = await (await ctxFor(browser, kind)).newPage();
      await viewer.goto(url.replace(/^https?:\/\/[^/]+/, BASE));
      await shot(viewer, p("20-shared-live-view"), { wait: 5000 });
      await viewer.context().close();
    }
  });
  await step("home-with-trip", async () => {
    await page.goto(`${BASE}/`);
    await shot(page, p("21-home-active-trip"), { wait: 5000 });
  });
  await step("trips-tab", async () => {
    await page.goto(`${BASE}/trips`);
    await shot(page, p("22-trips-active"), { full: true });
  });
  await step("end-trip", async () => {
    await page.goto(`${BASE}/trip`);
    await page.waitForTimeout(3000);
    await page.getByRole("button", { name: /I.m here/ }).click();
    await shot(page, p("23-trip-arrived"), { wait: 4000, full: true });
  });
  await step("mira", async () => {
    await page.goto(`${BASE}/mira`);
    await shot(page, p("24-mira-empty"), { wait: 2500 });
    if (process.env.ASK_MIRA === "1") {
      await page.getByPlaceholder("Message Mira…").fill("I'm walking back to Kamla Nagar now. Anything I should know?");
      await page.getByRole("button", { name: "Send" }).click();
      await shot(page, p("25-mira-reply"), { wait: 25000 });
    }
  });
  await step("contribute", async () => {
    await page.goto(`${BASE}/contribute`);
    await shot(page, p("26-contribute"), { full: true });
  });
  await step("report", async () => {
    await page.goto(`${BASE}/report`);
    await shot(page, p("27-report-tiles"));
    await page.getByRole("button", { name: /Dark or broken street/ }).click();
    await shot(page, p("28-report-form"), { full: true });
    await page.getByRole("button", { name: "Send privately" }).click();
    await shot(page, p("29-report-thanks"), { wait: 3000 });
  });
  await step("me", async () => {
    await page.goto(`${BASE}/me`);
    await shot(page, p("30-me"), { full: true, wait: 2500 });
  });
  await step("circle", async () => {
    await page.goto(`${BASE}/circle`);
    await shot(page, p("31-circle"), { full: true });
  });
  await step("inbox", async () => {
    await page.goto(`${BASE}/inbox`);
    await shot(page, p("32-inbox"), { full: true });
  });
  await step("privacy", async () => {
    await page.goto(`${BASE}/privacy`);
    await shot(page, p("33-privacy"));
  });
  await step("offline", async () => {
    await page.goto(`${BASE}/`);
    await page.waitForTimeout(3000);
    await ctx.setOffline(true);
    await page.getByRole("button", { name: /Search a place or address/ }).click();
    await page.getByPlaceholder("Search a place or address").fill("Hudson Lane");
    await shot(page, p("34-offline-search"), { wait: 3000 });
    await ctx.setOffline(false);
  });
  await ctx.close();
}
await browser.close();
