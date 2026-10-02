import { expect, test } from "@playwright/test";

// Place-search failure fixtures must reach Playwright's route handler, not a PWA service worker.
test.use({ serviceWorkers: "block" });

const ORIGIN = { id: "origin-1", name: "North Gate", kind: "entrance", lat: 28.6962, lon: 77.2142 };
const OTHER_ORIGIN = { id: "origin-2", name: "North Gate Road", kind: "road", lat: 28.6968, lon: 77.215 };
const DESTINATION = { id: "destination-1", name: "South Library", kind: "library", lat: 28.691, lon: 77.218 };

test("guest retains a future named-origin plan across Around, map, Mira, back and reload without asking for location", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("mira.welcomed", "1");
    const state = window as unknown as { geoCalls: number };
    state.geoCalls = 0;
    Object.defineProperty(navigator.geolocation, "getCurrentPosition", { configurable: true, value: () => { state.geoCalls += 1; } });
  });
  const queries: Array<{ q: string; near: unknown; source: unknown }> = [];
  await page.route("**/api/geo/search", async (route) => {
    const body = route.request().postDataJSON() as { q: string; near: unknown; source: unknown };
    queries.push({ q: body.q, near: body.near, source: body.source });
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ places: body.q.includes("North") ? [ORIGIN, OTHER_ORIGIN] : [DESTINATION] }) });
  });

  await page.goto("/plan");
  await expect(page.getByRole("heading", { name: "Plan a movement" })).toBeVisible();
  await page.getByLabel("What do you want to do?").fill("Run before dawn");
  await page.getByRole("textbox", { name: "From" }).fill("North Gate");
  await page.getByRole("button", { name: "Find" }).first().click();
  await expect(page.getByText("Choose the place you mean:")).toBeVisible();
  await expect(page.getByRole("button", { name: /North Gate Road/ })).toBeVisible();
  await page.getByRole("button", { name: /North Gate entrance/ }).click();
  await page.getByRole("textbox", { name: "To", exact: true }).fill("South Library");
  await page.getByRole("button", { name: "Find" }).last().click();
  await page.getByRole("button", { name: /South Library/ }).click();
  await page.getByLabel("Planned local time").fill("2026-10-07T04:45");
  await page.getByLabel("Time zone (IANA)").fill("Asia/Kolkata");
  await expect(page.getByRole("status").filter({ hasText: "Places resolved" })).toBeVisible();
  await page.getByRole("button", { name: "View in Around" }).click();
  await expect(page).toHaveURL(/\/around$/);
  await expect(page.getByRole("region", { name: "Current movement plan" })).toContainText("North Gate → South Library");
  await expect(page.getByRole("region", { name: "Current movement plan" })).toContainText("2026-10-07T04:45");
  await page.getByRole("button", { name: "View route & map" }).click();
  await expect(page).toHaveURL(/\/around\/map$/);
  await expect(page.getByText("Run before dawn · North Gate → South Library")).toBeVisible();
  await page.goBack();
  await expect(page.getByRole("region", { name: "Current movement plan" })).toContainText("North Gate");
  await page.goto("/mira");
  await expect(page.getByText("Your movement plan")).toBeVisible();
  await expect(page.getByText("Questions about this plan use checked evidence", { exact: false })).toBeVisible();
  await page.goto("/plan");
  await page.reload();
  await expect(page.getByRole("textbox", { name: "From" })).toHaveValue("North Gate");
  await expect(page.getByRole("textbox", { name: "To", exact: true })).toHaveValue("South Library");
  await expect(page.getByLabel("Planned local time")).toHaveValue("2026-10-07T04:45");
  expect(queries).toEqual([{ q: "North Gate", near: null, source: "osm" }, { q: "South Library", near: null, source: "osm" }]);
  await page.goto("/around/map");
  await expect(page.getByText("Run before dawn · North Gate → South Library")).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { geoCalls: number }).geoCalls)).toBe(0);
  await page.goto("/plan");
  expect(await page.evaluate(() => sessionStorage.getItem("mira.plan.v1"))).toContain("North Gate");
  await page.getByRole("button", { name: "Clear plan" }).click();
  await expect(page.getByRole("textbox", { name: "From" })).toHaveValue("");
  expect(await page.evaluate(() => sessionStorage.getItem("mira.plan.v1"))).not.toContain("North Gate");
});

test("failed and empty place lookup preserve the guest's typed origin", async ({ page }) => {
  await page.goto("/plan");
  let providerFailed = true;
  await page.route("**/api/geo/search", async (route) => {
    await route.fulfill(providerFailed ? { status: 503, contentType: "application/json", body: JSON.stringify({ error: { code: "provider_down", message: "Unavailable" } }) } : { status: 200, contentType: "application/json", body: JSON.stringify({ places: [] }) });
  });
  await page.getByRole("textbox", { name: "From" }).fill("Unknown Gate");
  await page.getByRole("button", { name: "Find" }).first().click();
  await expect(page.getByText(/Couldn.t check places/)).toBeVisible();
  await expect(page.getByRole("textbox", { name: "From" })).toHaveValue("Unknown Gate");
  providerFailed = false;
  await page.getByRole("button", { name: "Find" }).first().click();
  await expect(page.getByText(/No matching place found/)).toBeVisible();
  await expect(page.getByRole("textbox", { name: "From" })).toHaveValue("Unknown Gate");
});

test("opening and leaving an untouched draft keeps the legacy map entry available", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("mira.welcomed", "1"));
  await page.goto("/plan");
  await expect(page.getByRole("textbox", { name: "From" })).toHaveValue("");
  await page.goto("/around/map");
  await expect(page.getByRole("button", { name: /Search a place or address/ })).toBeVisible();
  await expect(page.getByText("Your plan is still being entered")).toHaveCount(0);
});
