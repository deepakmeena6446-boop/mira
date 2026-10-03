import { expect, test } from "@playwright/test";
import { newUser } from "./helpers";

test("guest Go opens plan, Ask and map without requesting GPS, with an explicit map location choice and immediate Emergency", async ({ page }) => {
  await page.addInitScript(() => {
    // A prior visit is deliberately not a prior location opt-in. Even the legacy map must
    // remain usable without silently creating consent or requesting GPS.
    localStorage.setItem("mira.welcomed", "1");
    const state = window as unknown as { geoCalls: number };
    state.geoCalls = 0;
    Object.defineProperty(navigator.geolocation, "getCurrentPosition", { configurable: true, value: () => { state.geoCalls++; } });
  });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "What’s your plan?", exact: true })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Main" }).getByRole("link")).toHaveText(["Go", "Journeys", "You"]);
  await expect(page.getByText("Compare routes and timing.", { exact: false })).toBeVisible();
  await expect(page.getByRole("region", { name: "Official & news updates" })).toHaveCount(0);
  await page.getByRole("button", { name: "Emergency options" }).first().focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog", { name: "Emergency call options" })).toContainText("couldn't determine which country you're in");
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("link", { name: "Enter places instead" }).click();
  await expect(page).toHaveURL(/\/plan$/);
  await page.getByLabel("What do you want to do?").fill("Get to a station");
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Go" }).click();
  await expect(page.getByLabel("What do you want to do?")).toHaveValue("Get to a station");
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Journeys" }).click();
  await expect(page.getByRole("region", { name: "Current travel plan" })).toContainText("Get to a station");
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Go" }).click();
  await page.goto("/mira");
  await expect(page).toHaveURL(/\/mira$/);
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Go" }).click();
  await page.goto("/around/map");
  await expect(page).toHaveURL(/\/around\/map$/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
  expect(await page.evaluate(() => (window as unknown as { geoCalls: number }).geoCalls)).toBe(0);
  expect(await page.evaluate(() => localStorage.getItem("mira.location.skip"))).toBeNull();
  await page.getByRole("button", { name: "Use my location for local context", exact: true }).click();
  expect(await page.evaluate(() => (window as unknown as { geoCalls: number }).geoCalls)).toBe(1);
  expect(await page.evaluate(() => localStorage.getItem("mira.location.skip"))).toBe("0");
});

test("signed-in person explicitly saves, opens and deletes a plan without starting a journey", async ({ browser }) => {
  const owner = await newUser(browser, "Saved");
  const { page } = owner;
  await page.goto("/plan");
  await page.getByLabel("What do you want to do?").fill("Visit the museum");
  await page.getByRole("textbox", { name: "From" }).fill("Central Station");
  await page.getByRole("textbox", { name: "To", exact: true }).fill("Museum");
  await page.getByRole("button", { name: "Save plan" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Saved to Journeys for 30 days" })).toBeVisible();
  await page.getByRole("button", { name: "Clear plan" }).click();
  await page.goto("/");
  await page.getByRole("button", { name: /Saved by you.*Visit the museum/ }).click();
  await expect(page.getByLabel("What do you want to do?")).toHaveValue("Visit the museum");
  await page.goto("/trips");
  await expect(page.getByRole("region", { name: "Saved plans" })).toContainText("Visit the museum");
  await page.getByRole("region", { name: "Saved plans" }).getByRole("link", { name: "Open plan" }).click();
  await expect(page).toHaveURL(/\/plan$/);
  await expect(page.getByLabel("What do you want to do?")).toHaveValue("Visit the museum");
  await page.goto("/trips");
  await page.getByRole("region", { name: "Saved plans" }).getByRole("button", { name: "Delete plan" }).click();
  await expect(page.getByRole("region", { name: "Saved plans" })).toContainText("No saved plans.");
  await expect(page.getByText("No journey right now")).toBeVisible();
  await owner.ctx.close();
});

test("first-screen night-out intent keeps event arrival and midnight return separate without guessing a date or GPS", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator.geolocation, "getCurrentPosition", { configurable: true, value: () => { throw new Error("Planning must not request GPS"); } });
  });
  await page.route("**/api/mira/intent", (route) => route.fulfill({ json: { hints: null } }));
  await page.goto("/");
  await page.getByRole("textbox", { name: "Your movement plan" }).fill("Dinner at 9 PM, return around midnight");
  await page.getByRole("button", { name: "Let’s plan" }).click();
  await expect(page.getByRole("combobox", { name: "Timing", exact: true })).toHaveValue("arrive_by");
  await expect(page.getByLabel("Planned local time")).toHaveValue("");
  await expect(page.getByLabel("Time zone (IANA)")).toHaveValue("");
  const draft = await page.evaluate(() => JSON.parse(sessionStorage.getItem("mira.plan.v1") ?? "null")?.draft);
  expect(draft.timeHint).toBe("9:00 PM");
  expect(draft.returnTimeHint).toBe("midnight");
  await page.getByRole("button", { name: "Return & legs" }).click();
  await expect(page.getByText("You mentioned a return around midnight. Confirm its date and local time below.", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem("mira.local-check-in.v1"))).toBeNull();
});
