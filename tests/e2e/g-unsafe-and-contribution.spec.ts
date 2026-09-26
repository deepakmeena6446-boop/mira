import { expect, test } from "@playwright/test";
import { db, newUser, openRoute, testClientIp } from "./helpers";

test.describe("When something feels wrong — instant, deterministic help", () => {
  test("Home: 'I feel unsafe' shows every action at once, with no Mira call, and walks to a Help Point", async ({ browser }) => {
    const { ctx, page } = await newUser(browser, "Tara");
    const miraCalls: string[] = [];
    page.on("request", (r) => new URL(r.url()).pathname.startsWith("/api/mira") && miraCalls.push(r.url()));
    // Help Points are fetched ahead when Home gets a location; wait until they're in (first open), then close.
    await page.getByRole("button", { name: "I feel unsafe" }).click();
    await expect(page.getByRole("dialog", { name: "Right now" }).getByRole("button", { name: /Go to the nearest Help Point/ })).toBeVisible();
    await page.getByRole("button", { name: "I'm okay now" }).click();
    await expect(page.getByRole("dialog", { name: "Right now" })).toBeHidden();

    // Everything the sheet needs is already on the device: it renders complete in the same frame as the tap.
    const renderedAt = await page.evaluate(async () => {
      const b = [...document.querySelectorAll("button")].find((x) => x.textContent?.trim() === "I feel unsafe")!;
      const t0 = performance.now();
      b.click();
      await new Promise((r) => requestAnimationFrame(() => r(null)));
      const d = document.querySelector('[role="dialog"][aria-labelledby="unsafe-h"]');
      const ready = Boolean(d?.querySelector('a[href="tel:112"]') && d?.textContent?.includes("Call someone") && d?.textContent?.includes("Go to the nearest Help Point"));
      return ready ? performance.now() - t0 : null;
    });
    expect(renderedAt).not.toBeNull();
    expect(renderedAt!).toBeLessThan(300); // the audit's target: options visible < 300 ms, no model, no round trip
    const sheet = page.getByRole("dialog", { name: "Right now" });
    await expect(sheet.getByRole("link", { name: /Emergency call, 112/ })).toHaveAttribute("href", "tel:112");
    await expect(sheet.getByRole("link", { name: /Talk to Mira/ })).toBeVisible();
    expect(miraCalls).toEqual([]);
    await expect(sheet).not.toContainText(/\b(safe place|you are safe|safest)\b/i);

    // "Call someone" never needs MIRA: the phone's picker, or a number typed here.
    await sheet.getByRole("button", { name: /Call someone/ }).click();
    await expect(sheet.getByLabel("Phone number to call")).toBeVisible();

    // The nearest Help Point opens its walk, ready to start with MIRA.
    await sheet.getByRole("button", { name: /Go to the nearest Help Point/ }).click();
    await expect(sheet).toBeHidden();
    await expect(page.getByRole("button", { name: /Start with MIRA/ })).toBeVisible();
    expect(miraCalls).toEqual([]);
    await ctx.close();
  });

  test("Trip: the same sheet offers the live link, and a Help Point shows where it is", async ({ browser }) => {
    const { ctx, page } = await newUser(browser, "Ira");
    await openRoute(page);
    await page.getByRole("button", { name: /Start with MIRA/ }).click();
    await page.waitForURL("**/trip");
    await expect(page.getByText(/Nearest Help Point/)).toBeVisible();
    await page.getByRole("button", { name: "I feel unsafe" }).click();
    const sheet = page.getByRole("dialog", { name: "Right now" });
    await expect(sheet.getByRole("button", { name: /Send my live link/ })).toBeVisible();
    await expect(sheet.getByRole("link", { name: /Emergency call, 112/ })).toHaveAttribute("href", "tel:112");
    await sheet.getByRole("button", { name: /Go to the nearest Help Point/ }).click();
    await expect(page.getByRole("link", { name: /Directions in Maps/ })).toBeVisible();
    await page.getByRole("button", { name: "End trip without arriving" }).click();
    await page.getByRole("button", { name: "End trip", exact: true }).click();
    await ctx.close();
  });
});

test.describe("Journeys that aren't walks", () => {
  test("by auto or cab: she picks the ETA, and the journey screen says how she's travelling", async ({ browser }) => {
    const { ctx, page } = await newUser(browser, "Meher");
    await openRoute(page);
    await page.getByRole("radio", { name: "Ride / car" }).click();
    // No provider driving time in the E2E env (OSM placeholder): she chooses when to expect to arrive.
    await expect(page.getByText("The driving time from here is not known.")).toBeVisible();
    await page.getByRole("radio", { name: "45 min" }).click();
    await expect(page.getByText(/expected in 45 min/)).toBeVisible();
    await page.getByRole("button", { name: /Start with MIRA/ }).click();
    await page.waitForURL("**/trip");
    await expect(page.getByRole("heading", { name: /by auto or cab/ })).toBeVisible();
    const [trip] = await db`SELECT mode, eta_at, created_at FROM journeys ORDER BY created_at DESC LIMIT 1`;
    expect(trip.mode).toBe("ride");
    expect(Math.round((new Date(trip.eta_at).getTime() - new Date(trip.created_at).getTime()) / 60_000)).toBe(45);
    await page.getByRole("button", { name: "End trip without arriving" }).click();
    await page.getByRole("button", { name: "End trip", exact: true }).click();
    await ctx.close();
  });
});

test.describe("After — one tiny factual contribution", () => {
  test("after a journey at night, even one ended early, she's asked 'Was the way lit?' once", async ({ browser }) => {
    const { ctx, page } = await newUser(browser, "Noor");
    const night = new Date();
    night.setHours(22, 30, 0, 0); // device clock only; the server keeps real time
    await page.clock.setFixedTime(night);
    await openRoute(page);
    await page.getByRole("button", { name: /Start with MIRA/ }).click();
    await page.waitForURL("**/trip");
    await page.getByRole("button", { name: "End trip without arriving" }).click();
    await page.getByRole("button", { name: "End trip", exact: true }).click();
    await expect(page.getByText("Was the way lit?")).toBeVisible();
    const before = (await db`SELECT count(*)::int AS n FROM lit_votes`)[0].n;
    await page.getByRole("button", { name: /Partly/ }).click();
    await expect(page.getByText(/Thank you/)).toBeVisible();
    expect((await db`SELECT count(*)::int AS n FROM lit_votes`)[0].n).toBeGreaterThan(before);
    // The route that was kept on the device is gone once she's answered.
    expect(await page.evaluate(() => Object.keys(sessionStorage).filter((k) => k.startsWith("mira.tripRoute.")))).toEqual([]);
    await ctx.close();
  });
});

test.describe("Degraded states are honest", () => {
  test("with location denied, Home explains it, search still works, and Emergency is still one tap", async ({ browser }) => {
    const ctx = await browser.newContext({ permissions: [], extraHTTPHeaders: { "x-forwarded-for": testClientIp() } });
    const page = await ctx.newPage();
    await page.goto("/");
    await page.waitForURL("**/welcome");
    await page.getByRole("button", { name: "Let's go" }).click();
    await page.getByRole("button", { name: "Use my location" }).click();
    await page.getByPlaceholder("Your first name").fill("Lina");
    await page.getByRole("button", { name: "Start using MIRA" }).click();
    await page.waitForURL((u) => u.pathname === "/");
    await expect(page.getByText(/Location is off for MIRA/)).toBeVisible();
    await expect(page.getByRole("link", { name: /Emergency call, 112/ })).toHaveAttribute("href", "tel:112");
    await page.getByRole("button", { name: "I feel unsafe" }).click();
    await expect(page.getByText("Turn on location to see the nearest Help Point.")).toBeVisible();
    await page.getByRole("button", { name: "I'm okay now" }).click();
    await page.getByRole("button", { name: /Search a place or address/ }).click();
    await page.getByPlaceholder("Search a place or address").fill("Vishwavidyalaya");
    await expect(page.getByRole("button", { name: /Vishwavidyalaya/ }).first()).toBeVisible();
    await ctx.close();
  });
});
