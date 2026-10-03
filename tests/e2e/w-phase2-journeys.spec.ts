import { expect, test, type Page } from "@playwright/test";
import { expectNoVerdictWords, newUser } from "./helpers";

// Phase 2 slice 1 (docs/phase2-ux/00 §1): Journeys timeline, plan identity and the way back.
const from = { lat: 28.6962, lon: 77.2142 };
const to = { lat: 28.691, lon: 77.218 };

/** A named, saveable plan for tomorrow 9 PM in Delhi, seeded once into this tab. */
async function seedPlan(page: Page) {
  const tomorrow = new Date(Date.now() + 86_400_000).toLocaleDateString("sv-SE", { timeZone: "Asia/Kolkata" });
  await page.addInitScript(({ from, to, day }) => {
    if (sessionStorage.getItem("mira.plan.v1")) return;
    sessionStorage.setItem("mira.plan.v1", JSON.stringify({ savedAt: Date.now(), draft: { version: 2, touched: true, activity: "Dinner with Riya", origin: { kind: "named", query: "North Gate", resolution: { source: "search", name: "North Gate", point: from, placeId: "north" } }, destination: { query: "South Library", resolution: { source: "search", name: "South Library", point: to, placeId: "south" } }, loop: false, departureLocal: `${day}T21:00`, timeZone: "Asia/Kolkata", mode: "walk", constraints: "", timeKind: "depart_at", destinationCountryIso: null, legs: [] } }));
  }, { from, to, day: tomorrow });
}

test("a guest's Journeys shows nothing running, the four ways to start, and why to sign in", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("mira.welcomed", "1"));
  await page.goto("/trips");
  await expect(page.getByRole("heading", { level: 1, name: "Journeys" })).toBeVisible();
  await expect(page.getByText("No journey right now")).toBeVisible();
  for (const start of ["Going somewhere", "Run or walk", "Travelling", "Check a place"]) await expect(page.getByRole("link", { name: start })).toBeVisible();
  await expect(page.getByText("Keep plans and go with Mira")).toBeVisible();
  await expect(page.getByRole("region", { name: "Last 24 hours" })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
});

test("the way back is added, checked for its own time, saved with the plan and named the same in Journeys", async ({ browser }) => {
  const { ctx, page } = await newUser(browser, "Riya");
  await seedPlan(page);
  await page.goto("/plan");
  await expect(page.getByRole("heading", { level: 1, name: "To South Library" })).toBeVisible();

  // Add the way back: same places reversed, time chosen relative to the trip there.
  const back = page.getByRole("region", { name: "The way back" });
  await back.getByRole("button", { name: /Add the way back/ }).click();
  const when = page.getByRole("dialog", { name: "When are you heading back?" });
  await when.getByRole("button", { name: /^2 h later · 11:00 PM$/ }).click();
  await when.getByRole("button", { name: "Done" }).click();
  await expect(back).toContainText("Back to North Gate");
  await expect(back).toContainText("11:00 PM");

  // Checking it brings the way back into the brief; the trip there stays one tap away.
  await back.getByRole("button", { name: "Way back: North Gate" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "To North Gate" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Your plan, at that time" })).toContainText(/11:00 PM/);
  await expect(page.getByRole("region", { name: "The way there" })).toContainText("To South Library");
  await expectNoVerdictWords(page);

  await page.getByRole("button", { name: "Save this plan" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Saved to Journeys for 30 days" })).toBeVisible();

  // Journeys names it exactly as Plan does, once, as the plan open in this tab.
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Journeys" }).click();
  const upcoming = page.getByRole("region", { name: "Coming up" });
  await expect(upcoming).toContainText("To North Gate");
  await expect(upcoming).toContainText("Saved · open now");
  await expect(upcoming.getByRole("link", { name: /^Continue plan/ })).toHaveCount(1);
  await ctx.close();
});

test("You groups people, places, contributions and settings in the same language, with confirmations in sheets", async ({ browser }) => {
  const { ctx, page } = await newUser(browser, "Meera");
  await page.goto("/me");
  await expect(page).toHaveTitle(/^You/);
  await expect(page.getByRole("heading", { level: 1, name: "Meera" })).toBeVisible();
  await expect(page.getByText("This account lives in this browser only")).toBeVisible();
  await expect(page.getByRole("region", { name: "Your Circle" }).getByRole("link", { name: /Add someone you trust/ })).toBeVisible();

  // A place is saved from a sheet, by name, from the current spot.
  await page.getByRole("region", { name: "Your places" }).getByRole("button", { name: "Add", exact: true }).click();
  const sheet = page.getByRole("dialog", { name: "Save where you are now" });
  await sheet.getByRole("radio", { name: /College/ }).click();
  await sheet.getByRole("button", { name: "Save my current spot" }).click();
  await expect(page.getByRole("region", { name: "Your places" })).toContainText("College");
  await expect(page.getByRole("button", { name: "Remove College" })).toBeVisible();

  // Help Point kinds are many-of-many switches that persist.
  const fuel = page.getByRole("region", { name: "Help Points Mira suggests" }).getByRole("switch", { name: /Fuel station/ });
  await expect(fuel).toHaveAttribute("aria-checked", "true");
  await fuel.click();
  await expect(fuel).toHaveAttribute("aria-checked", "false");
  await page.reload();
  await expect(page.getByRole("region", { name: "Help Points Mira suggests" }).getByRole("switch", { name: /Fuel station/ })).toHaveAttribute("aria-checked", "false");

  // Without a fresh position Mira names no country's numbers, and says the phone's own call still works.
  await expect(page.getByRole("region", { name: "Emergency where you are" })).toContainText("Your phone’s own emergency call always works");

  // Leaving a first-name account is confirmed in a sheet that says it deletes the account.
  await page.getByRole("button", { name: /^Sign out/ }).click();
  await expect(page.getByRole("dialog", { name: "Sign out and delete?" })).toContainText("there’s no way back in");
  await page.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
  await ctx.close();
});
