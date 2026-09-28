// Launch-UX invariant checks (docs tooling; not app code). Run against `mira-verify` on :3150:
//   node docs/launch-ux/tools/ux-checks.mjs
// V-anchor  (09 R-3): "I feel unsafe" and Emergency never intersect the bottom sheet, at every snap.
// V-one     (09 V-2): at most one visible primary (accent-filled) button per state.
// R-6       (09 R-6): no horizontal scroll.
// V-rm      (09 RM-1): with reduced motion, no running animations after 1 s (short opacity fades allowed).
// Creates a first-name test account on the local build and starts/ends one journey.
import { chromium } from "playwright";

const BASE = process.env.MIRA_BASE ?? "http://localhost:3150";
const GEO = { latitude: 28.6951, longitude: 77.2143 };
const ip = () => `10.${1 + Math.floor(Math.random() * 250)}.${1 + Math.floor(Math.random() * 250)}.${1 + Math.floor(Math.random() * 250)}`;
const results = [];
const check = (id, ok, detail = "") => {
  results.push({ id, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${id}${detail ? ` — ${detail}` : ""}`);
};

async function anchorsClear(page, where) {
  const sheet = page.locator("section[data-snap]").first();
  const unsafe = page.getByRole("button", { name: "I feel unsafe", exact: true });
  const emergency = page.getByRole("link", { name: /Emergency call/ }).or(page.getByRole("button", { name: /Emergency options/ })).first();
  await page.waitForTimeout(700);
  const [s, u, e] = await Promise.all([sheet.boundingBox(), unsafe.boundingBox(), emergency.boundingBox()]);
  const hit = (a, b) => a && b && a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
  const ok = Boolean(s && u && e) && !hit(s, u) && !hit(s, e) && (await unsafe.count()) === 1;
  check(`V-anchor ${where}`, ok, ok ? "" : JSON.stringify({ sheet: s, unsafe: u, emergency: e }));
}

async function snaps(page, where) {
  for (let i = 0; i < 3; i++) {
    const snap = await page.locator("section[data-snap]").first().getAttribute("data-snap");
    await anchorsClear(page, `${where} @${snap}`);
    await page.getByRole("button", { name: /Resize panel/ }).click();
  }
}

async function onePrimary(page, where) {
  const n = await page.locator('[data-variant="primary"]:visible').count();
  check(`V-one ${where}`, n <= 1, `${n} primary`);
}

async function noHScroll(page, where) {
  const ok = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  check(`R-6 ${where}`, ok);
}

async function reducedMotion(page, where) {
  await page.waitForTimeout(1200);
  const running = await page.evaluate(() =>
    document.getAnimations().filter((a) => {
      if (a.playState !== "running") return false;
      const t = a.effect?.getTiming?.();
      return !(t && Number(t.duration) <= 120 && t.iterations !== Infinity);
    }).length,
  );
  check(`V-rm ${where}`, running === 0, `${running} running`);
}

const browser = await chromium.launch();
for (const vp of [{ name: "M", width: 390, height: 844 }, { name: "S", width: 360, height: 740 }, { name: "D", width: 1366, height: 900 }]) {
  const mobile = vp.name !== "D";
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: mobile, hasTouch: mobile, geolocation: GEO, permissions: ["geolocation"], extraHTTPHeaders: { "x-forwarded-for": ip() }, reducedMotion: "reduce" });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/welcome`);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Use my location" }).click();
  await page.waitForURL((u) => u.pathname === "/");
  await page.waitForTimeout(4000);
  await snaps(page, `${vp.name} home-signed-out`);
  await onePrimary(page, `${vp.name} home-signed-out`);
  await noHScroll(page, `${vp.name} home`);
  await reducedMotion(page, `${vp.name} home`);
  // Sign in (first-name test account) and plan a walk.
  await page.getByRole("button", { name: "Sign in" }).first().click();
  await page.getByPlaceholder("Your first name").fill("Asha");
  await page.getByRole("dialog").getByRole("checkbox", { name: /18 or older/ }).check();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.waitForTimeout(2000);
  await page.goto(`${BASE}/`);
  await page.waitForTimeout(3000);
  await onePrimary(page, `${vp.name} home-signed-in`);
  await page.getByRole("button", { name: /Search a place or address/ }).click();
  await page.getByPlaceholder("Search a place or address").fill("Vishwavidyalaya Metro");
  await page.waitForTimeout(3000);
  await page.getByRole("dialog", { name: "Where to?" }).getByRole("button").filter({ hasText: /Vishwavidyalaya/ }).first().click();
  await page.waitForTimeout(7000);
  await snaps(page, `${vp.name} route-sheet`);
  await onePrimary(page, `${vp.name} route-sheet`);
  await noHScroll(page, `${vp.name} route-sheet`);
  await page.getByRole("button", { name: /Go with Mira/ }).click();
  await page.waitForURL("**/trip", { timeout: 20000 });
  await page.waitForTimeout(4000);
  const tabbar = await page.getByRole("navigation", { name: "Main" }).isVisible();
  check(`N-2 ${vp.name} tab bar hidden on open journey`, !tabbar);
  await snaps(page, `${vp.name} trip`);
  await onePrimary(page, `${vp.name} trip`);
  await noHScroll(page, `${vp.name} trip`);
  await reducedMotion(page, `${vp.name} trip`);
  await page.getByRole("button", { name: /I.m here/ }).click();
  await page.waitForTimeout(3000);
  const tabbarAfter = await page.getByRole("navigation", { name: "Main" }).isVisible();
  check(`N-2 ${vp.name} tab bar back after arrival`, tabbarAfter);
  await onePrimary(page, `${vp.name} arrived`);
  for (const path of ["/contribute", "/report", "/me", "/mira", "/trips", "/circle", "/inbox"]) {
    await page.goto(`${BASE}${path}`);
    await page.waitForTimeout(1500);
    await onePrimary(page, `${vp.name} ${path}`);
    await noHScroll(page, `${vp.name} ${path}`);
  }
  await ctx.close();
}
await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
