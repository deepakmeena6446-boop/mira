import { expect, test } from "@playwright/test";
import { acceptContactInvite, addContact, newUser } from "./helpers";

test.describe("Mobile extras — long-press report, inbox, time of day, installable PWA", () => {
  test("press and hold the map to report that exact spot", async ({ browser }, info) => {
    test.skip(info.project.name !== "mobile", "touch gesture");
    const { ctx, page } = await newUser(browser, "Pooja");
    await page.goto("/around/map");
    await page.waitForTimeout(3000); // let the map settle
    const size = page.viewportSize()!;
    const spot = await page.evaluate(({ w, h }) => {
      for (const [fx, fy] of [[0.3, 0.3], [0.7, 0.3], [0.25, 0.36], [0.75, 0.36]]) {
        const e = document.elementFromPoint(w * fx, h * fy);
        if (e?.classList.contains("maplibregl-canvas")) return { x: w * fx, y: h * fy };
      }
      return null;
    }, { w: size.width, h: size.height });
    expect(spot).not.toBeNull();
    const cdp = await ctx.newCDPSession(page);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [spot!] });
    await page.waitForTimeout(750);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    const card = page.getByRole("dialog", { name: "This spot" });
    await expect(card).toBeVisible();
    await expect(page).toHaveURL(/\/around\/map$/); // lifting the finger didn't "ghost tap" a button
    await card.getByRole("button", { name: /Report here/ }).click();
    await expect(page).toHaveURL(/\/report\?from=map$/); // the spot travels in memory, not the URL (only a UI entry hint)
    await expect(page.getByText(/^Reporting /)).toBeVisible();
    await page.getByRole("button", { name: /Dark or broken street/ }).click();
    await expect(page.getByRole("button", { name: "Use where I am instead" })).toBeVisible();
    await page.getByRole("button", { name: "Send privately" }).click();
    await expect(page.getByText(/Thank you/)).toBeVisible();
    await ctx.close();
  });

  test("the inbox tells you when a contact accepts, with a badge on Home", async ({ browser }) => {
    const owner = await newUser(browser, "Kiran");
    const address = await addContact(owner.page, "Maa", "maa");
    const contact = await acceptContactInvite(browser, address);
    await owner.page.goto("/");
    await expect(owner.page.getByRole("link", { name: "Updates, 2 new" })).toBeVisible(); // welcome + accepted
    await owner.page.getByRole("link", { name: /Updates/ }).click();
    await expect(owner.page.getByRole("heading", { name: "Updates" })).toBeVisible();
    await expect(owner.page.getByText("Maa accepted your invite")).toBeVisible();
    await expect(owner.page.getByText("Welcome to MIRA, Kiran")).toBeVisible();
    await owner.page.goto("/");
    await expect(owner.page.getByRole("link", { name: "Updates", exact: true })).toBeVisible(); // read now
    await owner.ctx.close();
    await contact.ctx.close();
  });

  test("the app follows the time of day, and Mira knows it's late", async ({ browser }) => {
    const ctx = await browser.newContext({ timezoneId: "Asia/Kolkata" });
    const page = await ctx.newPage();
    await page.clock.setFixedTime(new Date("2026-09-25T22:40:00+05:30"));
    await page.goto("/welcome");
    await expect(page.locator("html")).toHaveAttribute("data-daypart", "night");
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute("content", "#14111d");
    await page.clock.setFixedTime(new Date("2026-09-25T07:10:00+05:30"));
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-daypart", "dawn");
    await ctx.close();

    const { ctx: c2, page: p2 } = await newUser(browser, "Nidhi");
    await p2.clock.setFixedTime(new Date(Date.now()));
    await p2.evaluate(() => localStorage.setItem("mira.theme", "dark"));
    const hist = p2.waitForResponse((r) => new URL(r.url()).pathname === "/api/mira");
    await p2.goto("/mira");
    await hist;
    await expect(p2.locator("html")).toHaveAttribute("data-daypart", "night"); // "Dark" pinned in Me → App
    await expect(p2.getByRole("button", { name: "Take me home" })).toBeVisible();
    await expect(p2.getByRole("log").getByText(/I can help you get home/i)).toBeVisible();
    await c2.close();
  });

  test("production build registers the service worker and is installable", async ({ page }, info) => {
    test.skip(info.project.name !== "desktop", "one browser is enough");
    await page.goto("/welcome");
    const scope = await page.evaluate(async () => (await navigator.serviceWorker.ready).scope);
    expect(scope).toMatch(/\/$/);
    const manifest = await (await page.request.get("/manifest.webmanifest")).json();
    expect(manifest).toMatchObject({ display: "standalone", start_url: "/" });
    const cdp = await page.context().newCDPSession(page);
    const { installabilityErrors } = await cdp.send("Page.getInstallabilityErrors");
    expect(installabilityErrors).toEqual([]);
    // The offline cache holds no personal pages — only the offline page and static files.
    await expect.poll(() => page.evaluate(async () => (await caches.keys()).sort())).toEqual(["mira-shell-v7"]);
    await expect.poll(() => page.evaluate(async () => (await (await caches.open("mira-shell-v7")).keys()).map((r) => new URL(r.url).pathname).sort())).toEqual(["/daypart.js", "/icon.svg", "/manifest.webmanifest", "/offline.html", "/offline.js"]);
    // Offline, a navigation gets the offline page (never someone's cached home screen).
    await page.context().setOffline(true);
    await page.goto("/me").catch(() => {});
    await expect(page.getByRole("heading", { name: "You're offline" })).toBeVisible();
    // Offline, the page says how to call: the remembered country's numbers when Mira has one, else the phone's own emergency call (audit P08-005).
    await expect(page.getByText(/emergency call/i).first()).toBeVisible();
    // …which needs /offline.js from the cache: the script used to fail offline, leaving the call box empty (re-audit RA1).
    await expect(page.locator("#call > p")).toHaveCount(1);
    await page.context().setOffline(false);
  });
});
