import { expect, test } from "@playwright/test";
import { acceptContactInvite, addContact, newUser } from "./helpers";

test.describe("Mobile extras — long-press report, inbox, time of day, installable PWA", () => {
  test("press and hold the map to report that exact spot", async ({ browser }, info) => {
    test.skip(info.project.name !== "mobile", "touch gesture");
    const { ctx, page } = await newUser(browser, "Pooja");
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
    await expect(page).toHaveURL(/\/$/); // lifting the finger didn't "ghost tap" a button
    await card.getByRole("button", { name: /Report here/ }).click();
    await expect(page).toHaveURL(/\/report$/); // the spot travels in memory, not the URL
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
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute("content", "#120f24");
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
    await expect(p2.getByRole("button", { name: "Walk me home" })).toBeVisible();
    await expect(p2.getByRole("log").getByText(/It's late/)).toBeVisible();
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
    await page.waitForFunction(async () => (await caches.keys()).includes("mira-shell-v2"));
    const cached = await page.evaluate(async () => (await (await caches.open("mira-shell-v2")).keys()).map((r) => new URL(r.url).pathname).sort());
    expect(cached).toEqual(["/daypart.js", "/icon.svg", "/manifest.webmanifest", "/offline.html"]);
    // Offline, a navigation gets the offline page (never someone's cached home screen).
    await page.context().setOffline(true);
    await page.goto("/me").catch(() => {});
    await expect(page.getByRole("heading", { name: "You're offline" })).toBeVisible();
    await page.context().setOffline(false);
  });
});
