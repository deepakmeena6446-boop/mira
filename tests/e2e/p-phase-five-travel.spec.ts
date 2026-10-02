import { expect, test } from "@playwright/test";

test.use({ serviceWorkers: "block" });

const AIRPORT = { id: "airport-1", name: "Arrival Airport Terminal", kind: "airport", lat: 51.47, lon: -0.45 };
const HOTEL = { id: "hotel-1", name: "Harbour Hotel", kind: "hotel", lat: 51.52, lon: -0.12 };
const STATION = { id: "station-1", name: "City Station", kind: "station", lat: 51.53, lon: -0.12 };
const VENUE = { id: "venue-1", name: "Conference Venue", kind: "venue", lat: 51.54, lon: -0.12 };

test("S5 late remote arrival retains named places and gives honest destination coverage and transfer handoff", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("mira.welcomed", "1");
    Object.defineProperty(navigator.geolocation, "getCurrentPosition", { configurable: true, value: () => { throw new Error("unexpected GPS call"); } });
  });
  const searches: Array<{ q: string; near: unknown }> = [];
  await page.route("**/api/geo/search", async (route) => {
    const body = route.request().postDataJSON() as { q: string; near: unknown };
    searches.push({ q: body.q, near: body.near });
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ places: body.q.includes("Airport") ? [AIRPORT] : [HOTEL] }) });
  });
  await page.goto("/plan");
  await page.getByLabel("What do you want to do?").fill("Arrive at hotel after flight");
  await page.getByRole("textbox", { name: "From" }).fill("Arrival Airport");
  await page.getByRole("button", { name: "Find", exact: true }).first().click();
  await page.getByRole("button", { name: /Arrival Airport Terminal/ }).click();
  await page.getByRole("textbox", { name: "To", exact: true }).fill("Harbour Hotel");
  await page.getByRole("button", { name: "Find", exact: true }).last().click();
  await page.getByRole("button", { name: /Harbour Hotel hotel/ }).click();
  await page.getByLabel("Planned local time").fill("2026-10-03T01:30");
  await page.getByLabel("Time zone (IANA)").fill("Europe/London");
  await page.getByLabel("Destination country for leg 1").selectOption("GB");
  await expect(page.getByLabel("Leg 1 coverage")).toContainText("2026-10-03T00:30:00.000Z UTC");
  await expect(page.getByLabel("Leg 1 coverage")).toContainText("emergency information verified");
  await expect(page.getByLabel("Leg 1 coverage")).toContainText("not your current emergency location");
  await page.reload();
  await expect(page.getByRole("textbox", { name: "From" })).toHaveValue("Arrival Airport Terminal");
  await expect(page.getByLabel("Destination country for leg 1")).toHaveValue("GB");
  expect(searches).toEqual([{ q: "Arrival Airport", near: null }, { q: "Harbour Hotel", near: null }]);
});

test("S6 two extra city legs keep distinct time zones, expose partial/unknown country gaps and search failure", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("mira.welcomed", "1"));
  await page.route("**/api/geo/search", async (route) => {
    const query = (route.request().postDataJSON() as { q: string }).q;
    if (query === "Unavailable Hotel") return route.fulfill({ status: 429, contentType: "application/json", body: JSON.stringify({ error: { code: "quota", message: "Rate limited" } }) });
    const hit = query.includes("Station") ? STATION : query.includes("Venue") ? VENUE : AIRPORT;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ places: [hit] }) });
  });
  await page.goto("/plan");
  await page.getByRole("button", { name: "Add travel leg" }).click();
  await page.getByLabel("Leg 2 purpose").fill("Station to venue");
  await page.getByLabel("Leg 2 from").fill("City Station");
  await page.getByRole("button", { name: "Find origin for leg 2" }).click();
  await page.getByRole("button", { name: /City Station · station/ }).click();
  await page.getByLabel("Leg 2 to").fill("Conference Venue");
  await page.getByRole("button", { name: "Find destination for leg 2" }).click();
  await page.getByRole("button", { name: /Conference Venue · venue/ }).click();
  await page.getByLabel("Leg 2 local departure").fill("2026-10-03T09:00");
  await page.getByLabel("Leg 2 IANA time zone").fill("Europe/London");
  await page.getByLabel("Destination country for leg 2").selectOption("GH");
  await expect(page.getByLabel("Leg 2", { exact: true })).toContainText("emergency information partly verified");
  await expect(page.getByLabel("Leg 2", { exact: true })).toContainText("Ride or transit at planned time");
  await page.getByRole("button", { name: "Add travel leg" }).click();
  await page.getByLabel("Leg 3 purpose").fill("Airport to hotel");
  await page.getByLabel("Leg 3 from").fill("Arrival Airport");
  await page.getByRole("button", { name: "Find origin for leg 3" }).click();
  await page.getByRole("button", { name: /Arrival Airport Terminal · airport/ }).click();
  await page.getByLabel("Leg 3 to").fill("Unavailable Hotel");
  await page.getByRole("button", { name: "Find destination for leg 3" }).click();
  await expect(page.getByLabel("Leg 3", { exact: true })).toContainText("Place search failed or quota was reached");
  await page.getByLabel("Leg 3 local departure").fill("2026-10-04T01:30");
  await page.getByLabel("Leg 3 IANA time zone").fill("Asia/Kolkata");
  await page.getByLabel("Destination country for leg 3").selectOption("AF");
  await expect(page.getByLabel("Leg 3", { exact: true })).toContainText("Local emergency number for this destination is not verified");
  await expect(page.getByLabel("Leg 3", { exact: true })).toContainText("Typed names are retained if search is unavailable");
  await page.reload();
  await expect(page.getByLabel("Leg 2 IANA time zone")).toHaveValue("Europe/London");
  await expect(page.getByLabel("Leg 3 IANA time zone")).toHaveValue("Asia/Kolkata");
  await expect(page.getByLabel("Leg 3 to")).toHaveValue("Unavailable Hotel");
});

test("S4 event return can be selected for review without losing the arrival leg or sharing", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => {
    localStorage.setItem("mira.welcomed", "1");
    const place = (query: string, lat: number) => ({ query, resolution: { source: "search", name: query, point: { lat, lon: 77.21 } } });
    sessionStorage.setItem("mira.plan.v1", JSON.stringify({ savedAt: Date.now(), draft: { version: 1, touched: true, activity: "Arrive at event", origin: { kind: "named", ...place("Station", 28.69) }, destination: place("Venue", 28.70), loop: false, departureLocal: "2026-10-03T18:00", timeZone: "Asia/Kolkata", mode: "walk", constraints: "", destinationCountryIso: null, legs: [{ label: "Return from event", origin: place("Venue", 28.70), destination: place("Station", 28.69), departureLocal: "2026-10-03T22:30", timeZone: "Asia/Kolkata", mode: "walk", destinationCountryIso: null }] } }));
  });
  await page.goto("/plan");
  await expect(page.getByLabel("Leg 2", { exact: true })).toContainText("Return from event");
  await page.getByRole("button", { name: "Review leg 2 in Around" }).click();
  await expect(page).toHaveURL(/\/around$/);
  await page.goto("/plan");
  await expect(page.getByRole("region", { name: "Plan state" })).toContainText("Return from event");
  await expect(page.getByLabel("Leg 2", { exact: true })).toContainText("Arrive at event");
});
