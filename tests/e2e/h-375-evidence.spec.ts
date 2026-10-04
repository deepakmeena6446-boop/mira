import { expect, test } from "@playwright/test";
import { DEST, newUser, openRoute, openSavedRoute, savePlaceAt, startJourney } from "./helpers";

/** Exact small-phone check: the chosen walk's evidence must precede Start and fit the viewport. */
test("375 px walk shows lighting before Start, with accessible details and no horizontal overflow", async ({ browser }, info) => {
  test.skip(info.project.name !== "mobile", "one 375 px browser is enough");
  const { ctx, page } = await newUser(browser, "Asha");
  await page.setViewportSize({ width: 375, height: 812 });
  await openRoute(page);
  // The evidence comes before the decision: Mira's ledger, then Go with Mira.
  const evidence = page.getByRole("region", { name: "What Mira checked" });
  const start = page.getByRole("button", { name: "Go with Mira" });
  await expect(evidence).toBeVisible();
  await expect(evidence).toContainText(/Lighting/);
  await expect(evidence).toContainText("Mira can’t see");
  await expect(start).toBeVisible();
  expect(await evidence.evaluate((node) => { const button = [...document.querySelectorAll("button")].find((b) => b.textContent?.includes("Go with Mira")); return Boolean(button && (node.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING)); })).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  await savePlaceAt(page, "Home", DEST);
  await openSavedRoute(page, "Home");
  await expect(page.getByRole("region", { name: "What Mira checked" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  await ctx.close();
});

/** Keep the emergency, help, arrival and contribution actions usable at the requested width. */
test("375 px Help Points, Emergency, arrival and Contribute remain usable", async ({ browser }, info) => {
  test.skip(info.project.name !== "mobile", "one 375 px browser is enough");
  const { ctx, page } = await newUser(browser, "Leena");
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/around/map");
  await expect(page.getByRole("region", { name: "Help Points near you" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  await expect(page.getByRole("link", { name: "Emergency call, 112" })).toHaveAttribute("href", "tel:112");
  await page.getByRole("button", { name: "I feel unsafe" }).click();
  await expect(page.getByRole("dialog", { name: "Right now" }).getByLabel("Immediate Emergency action").getByRole("link", { name: "Emergency call, 112" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  await page.getByRole("button", { name: "I'm okay now" }).click();
  await page.goto("/contribute");
  // Phase 2: what you can add leads; a new person's impact isn't shown as a wall of zeros.
  await expect(page.getByRole("heading", { level: 1, name: "Add what you know" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Report something" }).getByRole("link", { name: /Dark or broken street/ })).toBeVisible();
  await expect(page.getByRole("img", { name: /Verified contributions:/ })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  await openRoute(page);
  await startJourney(page);
  await page.getByRole("button", { name: /I'm here/ }).click();
  await expect(page.getByText(/You made it/).first()).toBeVisible();
  await expect(page.getByText(/Was the way lit\?|Nothing needed from you|Preparing|check later in Contribute/).first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  await ctx.close();
});
