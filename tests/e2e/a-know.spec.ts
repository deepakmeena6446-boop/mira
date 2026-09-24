import { expect, test } from "@playwright/test";
import { db, expectNoVerdictWords, pickPlace } from "./helpers";

test.describe("Flow A — KNOW with real pilot data", () => {
  // Baseline: real map data with zero community releases.
  test.beforeAll(async () => {
    await db`DELETE FROM aggregate_releases`;
  });

  test("Home → Know → real route with sourced facts and uncertainty; tiles blocked → list view", async ({ page, browser }) => {
    await page.goto("/");
    await page.getByRole("link", { name: /Know the area/ }).click();
    await expect(page).toHaveURL(/\/know$/);
    await pickPlace(page, /Where to\?/, "Vishwavidyalaya Metro Gate No. 1");
    await pickPlace(page, /Starting from/, "GTB Nagar Metro Gate No. 1");
    await page.getByRole("button", { name: /Compare walking paths/ }).click();
    await expect(page.getByRole("heading", { name: "Shortest mapped path" })).toBeVisible();
    await expect(page.getByText(/Estimated walking time at 4\.5 km\/h/).first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "What we don't know" })).toBeVisible();
    await expect(page.getByText("No recent community data")).toBeVisible();
    await page.getByText("Sources and last updated").click();
    await expect(page.getByText(/Map snapshot taken \d+ \w+ 2026/)).toBeVisible();
    await expect(page.locator(".maplibregl-ctrl-attrib")).toContainText("OpenStreetMap");
    await expect(page).toHaveURL(/\/know$/); // no coordinates or places in the URL
    await expectNoVerdictWords(page);

    // Same flow with map tiles blocked, then the text-only list view.
    const ctx = await browser.newContext({ viewport: page.viewportSize()! });
    await ctx.route("https://tile.openstreetmap.org/**", (r) => r.abort("failed"));
    const p2 = await ctx.newPage();
    await p2.goto("/know");
    await pickPlace(p2, /Where to\?/, "Vishwavidyalaya Metro Gate No. 1");
    await pickPlace(p2, /Starting from/, "GTB Nagar Metro Gate No. 1");
    await p2.getByRole("button", { name: /Compare walking paths/ }).click();
    await expect(p2.getByText("The map couldn't load")).toBeVisible({ timeout: 30_000 });
    await expect(p2.getByRole("heading", { name: "Shortest mapped path" })).toBeVisible();
    await expect(p2.getByRole("button", { name: /Highlight on map/ })).toHaveCount(0);
    await p2.getByRole("button", { name: "Text only" }).click();
    await p2.getByText(/Path as text/).first().click();
    await expect(p2.getByRole("listitem").filter({ hasText: /Marg|lane|footpath/ }).first()).toBeVisible();
    await ctx.close();
  });

  test("place page shows mapped facts, community section and unknowns", async ({ page }) => {
    await page.goto("/know");
    await pickPlace(page, /Where to\?/, "Vishwavidyalaya Metro Gate No. 1");
    await page.getByRole("link", { name: "Place information only" }).click();
    await expect(page.getByRole("heading", { name: "Mapped information" })).toBeVisible();
    await expect(page.getByText("Mapped metro entrance", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Community observations" })).toBeVisible();
    await expect(page.getByText("No recent community observations are available here. This is not a statement about current conditions.")).toBeVisible();
    await page.getByRole("radio", { name: "Late" }).check({ force: true });
    await expect(page.getByText(/late hours \(22:00–06:00 IST\)/).first()).toBeVisible();
    await expectNoVerdictWords(page);
  });
});
