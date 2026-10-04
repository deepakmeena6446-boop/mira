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
    // Seed once: later navigations keep the tab plan (and its chosen option), as in real use.
    if (!sessionStorage.getItem("mira.plan.v1")) sessionStorage.setItem("mira.plan.v1", JSON.stringify({ savedAt: Date.now(), draft: { version: 1, touched: true, activity: "Get to the library", origin: { kind: "named", query: "North Gate", resolution: { source: "search", name: "North Gate", point: from, placeId: "north" } }, destination: { query: "South Library", resolution: { source: "search", name: "South Library", point: to, placeId: "south" } }, loop, departureLocal, timeZone: "Asia/Kolkata", mode, constraints: "" } }));
  }, { mode, departureLocal, from, to, loop });
}

test("S1 early walk compares mapped options and preserves evidence on map", async ({ page }) => {
  await seed(page, "walk", "2026-10-07T04:45");
  await page.route("**/api/plan/options", async (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(answer) }));
  await page.goto("/plan?planStep=options");
  const comparison = page.getByRole("region", { name: "Plan options" });
  await expect(comparison.getByRole("button", { name: /Shortest mapped walk/ })).toBeVisible();
  await expect(comparison.getByRole("button", { name: /Different mapped walk/ })).toBeVisible();
  await expect(comparison).toContainText("dark");
  await comparison.getByText("Sources and what Mira can’t see").click();
  await expect(comparison).toContainText("Mira can’t check services at that time");
  await comparison.getByRole("button", { name: /Different mapped walk/ }).click();
  await expect(comparison.getByRole("button", { name: /Different mapped walk/ })).toHaveAttribute("aria-pressed", "true");
  // The chosen option is kept with the tab's plan across a reload.
  await page.reload();
  await expect(page.getByRole("region", { name: "Plan options" })).toContainText("OpenStreetMap imported walking graph");
  await expect(page.getByRole("region", { name: "Plan options" }).getByRole("button", { name: /Different mapped walk/ })).toHaveAttribute("aria-pressed", "true");
});

test("S2 late transit says future service is unknown", async ({ page }) => {
  await seed(page, "transit", "2026-10-07T23:15");
  await page.route("**/api/plan/options", async (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ...answer, state: "empty", options: [], detail: "No eligible planned-time transit source is enabled.", manualPlan: { mode: "transit", serviceEligible: false, nextSteps: ["Confirm departure, stops, connections and last service directly."] } }) }));
  await page.goto("/plan?planStep=options");
  await expect(page.getByRole("region", { name: "Plan options" }).getByRole("button", { name: /mapped walk/ })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Plan options" })).toContainText("Transit: confirm directly");
  await page.getByText("Sources and what Mira can’t see").click();
  await expect(page.getByRole("region", { name: "Plan options" })).toContainText("Mira can’t check services at that time");
  await expect(page.getByRole("region", { name: "Plan options" })).toContainText("Mira can’t see opening hours, lighting, staffing");
});

test("S1 early loop shows the fixture coverage gap and a later daylight alternative", async ({ page }) => {
  await seed(page, "walk", "2026-10-07T04:45", true);
  await page.route("**/api/plan/options", async (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ...answer, state: "empty", options: [], detail: "No suitable mapped loop in the checked fixture.", timeAlternatives: [{ local: "2026-10-07T06:45", timeZone: "Asia/Kolkata", minutesLater: 120, daylight: "daylight" }] }) }));
  await page.goto("/plan?planStep=options");
  const comparison = page.getByRole("region", { name: "Plan options" });
  await expect(comparison).toContainText("No suitable mapped loop in the checked fixture");
  await expect(comparison).toContainText("dark (approximate)");
  await expect(comparison).toContainText("Daylight by about 2026-10-07 06:45");
  await expect(comparison).toContainText("120 minutes later");
});

test("S3 missing network reports an explicit coverage gap", async ({ page }) => {
  await seed(page, "walk", "2026-10-07T18:30");
  await page.route("**/api/plan/options", async (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ...answer, state: "missing", options: [], source: null, sourceAt: null, detail: "Walking graph has not been imported for this area." }) }));
  await page.goto("/plan?planStep=options");
  await expect(page.getByRole("region", { name: "Plan options" })).toContainText("Walking graph has not been imported for this area.");
  await expect(page.getByRole("region", { name: "Plan options" }).getByRole("button", { name: /mapped walk/ })).toHaveCount(0);
});

test("a failed mapped check keeps local daylight and offers an explicit retry", async ({ page }) => {
  await seed(page, "walk", "2026-10-07T04:45");
  let requests = 0;
  await page.route("**/api/plan/options", async (route) => {
    requests++;
    if (requests === 1) return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: { code: "provider_failed", message: "Route source unavailable" } }) });
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(answer) });
  });
  await page.goto("/plan?planStep=options");
  const comparison = page.getByRole("region", { name: "Plan options" });
  await expect(comparison).toContainText("Couldn’t check routes");
  await expect(comparison).toContainText("Daylight: dark");
  await expect(comparison).toContainText("Your plan is kept");
  await comparison.getByRole("button", { name: "Try again" }).click();
  await expect(comparison.getByRole("button", { name: /Shortest mapped walk/ })).toBeVisible();
  expect(requests).toBe(2);
});
