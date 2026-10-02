import { expect, test } from "@playwright/test";

const from = { lat: 28.6962, lon: 77.2142 };
const to = { lat: 28.691, lon: 77.218 };
const source = { id: "osm-walking-graph", label: "OpenStreetMap imported walking graph; distance at 4.5 km/h", observedAt: "2026-09-24T18:11:11.000Z", expiresAt: "2027-09-24T18:11:11.000Z" };
const scope = { kind: "route", ref: "pilot route", timeZone: "Asia/Kolkata" };
const option = (id: string, label: string, minutes: number) => ({ id, label, minutes, meters: minutes * 75, geometry: [[from.lon, from.lat], [to.lon, to.lat]], evidence: [{ status: "known", claim: "Mapped walking time estimate", value: minutes, scope, source }] });
const answer = { state: "ready", checkedAt: "2026-10-02T04:00:00.000Z", source: "OpenStreetMap imported walking graph", sourceAt: source.observedAt, scope: "pilot route", options: [option("walk-0", "Shortest mapped walk", 9), option("walk-1", "Different mapped walk", 12)], daylight: { status: "known", claim: "Daylight at planned departure", value: "dark", scope: { kind: "area", ref: "pilot", timeZone: "Asia/Kolkata" }, source: { id: "noaa-solar-equations", label: "NOAA solar-position calculation", observedAt: "2026-10-02T04:00:00.000Z", expiresAt: null } }, service: { status: "unknown", claim: "Ride and transit service at planned time", scope, reason: "unsupported", retryable: false }, detail: "Compare distance and time; neither path is a safety recommendation." };

async function seed(page: import("@playwright/test").Page, mode: "walk" | "ride" | "transit", departureLocal: string, loop = false) {
  await page.addInitScript(({ mode, departureLocal, from, to, loop }) => {
    localStorage.setItem("mira.welcomed", "1");
    sessionStorage.setItem("mira.plan.v1", JSON.stringify({ savedAt: Date.now(), draft: { version: 1, touched: true, activity: "Get to the library", origin: { kind: "named", query: "North Gate", resolution: { source: "search", name: "North Gate", point: from, placeId: "north" } }, destination: { query: "South Library", resolution: { source: "search", name: "South Library", point: to, placeId: "south" } }, loop, departureLocal, timeZone: "Asia/Kolkata", mode, constraints: "" } }));
  }, { mode, departureLocal, from, to, loop });
}

test("S1 early walk compares mapped options and preserves evidence on map", async ({ page }) => {
  await seed(page, "walk", "2026-10-07T04:45");
  await page.route("**/api/plan/options", async (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(answer) }));
  await page.goto("/around");
  const comparison = page.getByRole("region", { name: "Plan options" });
  await expect(comparison.getByRole("button", { name: /Shortest mapped walk/ })).toBeVisible();
  await expect(comparison.getByRole("button", { name: /Different mapped walk/ })).toBeVisible();
  await expect(comparison).toContainText("dark");
  await expect(comparison).toContainText("No verified planned-time service source");
  await comparison.getByRole("button", { name: /Different mapped walk/ }).click();
  await expect(comparison.getByRole("button", { name: /Different mapped walk/ })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "View route & map" }).click();
  await expect(page).toHaveURL(/\/around\/map$/);
  await expect(page.getByRole("region", { name: "Plan options" })).toContainText("OpenStreetMap imported walking graph");
  await expect(page.getByRole("region", { name: "Plan options" }).getByRole("button", { name: /Different mapped walk/ })).toHaveAttribute("aria-pressed", "true");
});

test("S2 late transit says future service is unknown", async ({ page }) => {
  await seed(page, "transit", "2026-10-07T23:15");
  await page.route("**/api/plan/options", async (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(answer) }));
  await page.goto("/around");
  await expect(page.getByRole("region", { name: "Plan options" })).toContainText("No verified planned-time service source");
  await expect(page.getByRole("region", { name: "Plan options" })).toContainText("Lighting and opening hours");
});

test("S1 early loop calculates darkness while routing remains unavailable", async ({ page }) => {
  await seed(page, "walk", "2026-10-07T04:45", true);
  await page.route("**/api/plan/options", async (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ...answer, state: "empty", options: [], detail: "same place" }) }));
  await page.goto("/around");
  const comparison = page.getByRole("region", { name: "Plan options" });
  await expect(comparison).toContainText("Loop routing is unavailable");
  await expect(comparison).toContainText("Daylight at departure: dark");
  await expect(comparison).toContainText("Lighting and activity on a loop are unknown");
});

test("S3 missing network reports an explicit coverage gap", async ({ page }) => {
  await seed(page, "walk", "2026-10-07T18:30");
  await page.route("**/api/plan/options", async (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ...answer, state: "missing", options: [], source: null, sourceAt: null, detail: "Walking graph has not been imported for this area." }) }));
  await page.goto("/around");
  await expect(page.getByRole("region", { name: "Plan options" })).toContainText("Walking graph has not been imported for this area.");
  await expect(page.getByRole("region", { name: "Plan options" }).getByRole("button", { name: /mapped walk/ })).toHaveCount(0);
});
