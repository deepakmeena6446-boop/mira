import { expect, test } from "@playwright/test";
import { newUser } from "./helpers";

test("guest Home shows Mira live, opens Plan, Mira and Around without requesting GPS, with an explicit location choice and immediate Emergency", async ({ page }) => {
  await page.addInitScript(() => {
    // A prior visit is deliberately not a prior location opt-in: nothing may request GPS silently.
    localStorage.setItem("mira.welcomed", "1");
    const state = window as unknown as { geoCalls: number };
    state.geoCalls = 0;
    Object.defineProperty(navigator.geolocation, "getCurrentPosition", { configurable: true, value: () => { state.geoCalls++; } });
  });
  await page.goto("/");
  // Phase 1 roots (D39) and the live card in its location-not-chosen state.
  await expect(page.getByRole("navigation", { name: "Main" }).getByRole("link")).toHaveText(["Home", "Mira", "Around", "Journeys"]);
  const live = page.getByRole("region", { name: "Right now, around you" });
  await expect(live).toContainText("See what’s open, lit and noticed around you");
  await expect(page.getByRole("region", { name: "Official & news updates" })).toHaveCount(0);
  // Contributing is one tap from Home, without an account.
  await expect(page.getByRole("heading", { name: "Add what you see here" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Dark or broken street" })).toBeVisible();
  await page.getByRole("button", { name: "Emergency options" }).first().focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog", { name: "Emergency call options" })).toContainText("couldn't determine which country you're in");
  await page.getByRole("button", { name: "Close", exact: true }).click();
  // A situation opens the decision flow; the plan is kept across tabs.
  await page.getByRole("link", { name: "Going somewhere" }).click();
  await expect(page).toHaveURL(/\/plan\?for=go$/);
  await expect(page.getByRole("heading", { level: 1, name: "Where are you going?" })).toBeVisible();
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Mira" }).click();
  await expect(page).toHaveURL(/\/mira$/);
  await expect(page.getByRole("textbox", { name: "Message Mira" })).toBeVisible();
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Around" }).click();
  await expect(page).toHaveURL(/\/around$/);
  await expect(page.getByRole("region", { name: "Right now, around you" })).toBeVisible();
  await page.goto("/around/map");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
  expect(await page.evaluate(() => (window as unknown as { geoCalls: number }).geoCalls)).toBe(0);
  expect(await page.evaluate(() => localStorage.getItem("mira.location.skip"))).toBeNull();
  await page.getByRole("region", { name: "On the map" }).getByRole("button", { name: "Use my location" }).click();
  expect(await page.evaluate(() => (window as unknown as { geoCalls: number }).geoCalls)).toBe(1);
  // Her choice is recorded from the phone's answer (a refusal becomes "off"); this stub never answers, so nothing yet.
  expect(await page.evaluate(() => localStorage.getItem("mira.location.skip"))).toBeNull();
});

test("signed-in person explicitly saves, opens and deletes a plan without starting a journey", async ({ browser }) => {
  const owner = await newUser(browser, "Saved");
  const { page } = owner;
  await page.goto("/plan/legs");
  await page.getByLabel("What do you want to do?").fill("Visit the museum");
  await page.getByRole("textbox", { name: "From" }).fill("Central Station");
  await page.getByRole("textbox", { name: "To", exact: true }).fill("Museum");
  await page.getByRole("button", { name: "Save plan" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Saved to Journeys for 30 days" })).toBeVisible();
  await page.getByRole("button", { name: "Clear plan" }).click();
  // Home's "Mira noticed" reopens it in the decision screen, asking which named places were meant.
  await page.goto("/");
  await page.getByRole("button", { name: /Saved plan.*Visit the museum/ }).click();
  await expect(page).toHaveURL(/\/plan$/);
  await expect(page.getByText("Which “Central Station” did you mean? Tap to choose.")).toBeVisible();
  // Journeys lists the saved plan Home just opened once — as this tab's plan, by its derived name.
  await page.goto("/trips");
  const upcoming = page.getByRole("region", { name: "Coming up" });
  await expect(upcoming).toContainText("Visit the museum");
  await expect(upcoming).toContainText("Saved · open now");
  await expect(upcoming.getByRole("button", { name: /^Open plan/ })).toHaveCount(0);
  await upcoming.getByRole("link", { name: "Continue plan: To Museum" }).click();
  await expect(page).toHaveURL(/\/plan$/);
  await expect(page.getByText("Which “Museum” did you mean? Tap to choose.")).toBeVisible();
  await page.goto("/trips");
  await upcoming.getByRole("button", { name: "Delete plan" }).click();
  await expect(upcoming).toContainText("In this tab");
  expect((await (await page.request.get("/api/me/plans")).json()).plans).toHaveLength(0);
  await expect(page.getByText("No journey right now")).toBeVisible();
  await owner.ctx.close();
});

test("a night-out sentence on Home reaches Mira and becomes a plan without guessing a date or asking for GPS", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator.geolocation, "getCurrentPosition", { configurable: true, value: () => { throw new Error("Planning must not request GPS"); } });
  });
  await page.goto("/");
  await page.getByRole("textbox", { name: "Tell Mira what you’re about to do" }).fill("Dinner at 9 PM, return around midnight");
  await page.getByRole("button", { name: "Ask Mira" }).click();
  await expect(page).toHaveURL(/\/mira$/);
  // The question is handed over in memory (never in the URL) and answered from checked evidence.
  await expect(page.getByRole("region", { name: "Plan evidence" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Complete plan" })).toBeVisible();
  const draft = await page.evaluate(() => JSON.parse(sessionStorage.getItem("mira.plan.v1") ?? "null")?.draft);
  expect(draft.timeKind).toBe("arrive_by");
  expect(draft.departureLocal).toBe("");
  expect(draft.timeHint).toBe("9:00 PM");
  expect(draft.returnTimeHint).toBe("midnight");
  await page.getByRole("link", { name: "Complete plan" }).click();
  await expect(page).toHaveURL(/\/plan$/);
  await expect(page.getByText("You said 9:00 PM — choose the day")).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem("mira.local-check-in.v1"))).toBeNull();
});
