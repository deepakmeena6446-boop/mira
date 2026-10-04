import { expect, test } from "@playwright/test";
import { GEO, newUser } from "./helpers";
import type { MovementIntent } from "../../src/domain/plan-contract";
import { fixtureOptions } from "./plan-fixtures";

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
  await page.goto("/plan/legs");
  await page.getByLabel("What do you want to do?").fill("Arrive at hotel after flight");
  await page.getByRole("textbox", { name: "From" }).fill("Arrival Airport");
  await page.getByRole("button", { name: "Find", exact: true }).first().click();
  await page.getByRole("button", { name: /Arrival Airport Terminal/ }).click();
  await page.getByRole("textbox", { name: "To", exact: true }).fill("Harbour Hotel");
  await page.getByRole("button", { name: "Find", exact: true }).last().click();
  await page.getByRole("button", { name: /Harbour Hotel hotel/ }).click();
  await page.getByLabel("Planned local time").fill("2026-10-03T01:30");
  await page.getByLabel("Time zone (IANA)").fill("Europe/London");
  await page.getByRole("button", { name: "Return & legs" }).click();
  await page.getByText("Destination facts for leg 1", { exact: true }).click();
  await page.getByLabel("Destination country for leg 1").selectOption("GB");
  await expect(page.getByLabel("Leg 1 summary")).toContainText("2026-10-03 01:30 (Europe/London)");
  await expect(page.getByLabel("Leg 1 summary")).toContainText("emergency information verified");
  await expect(page.getByLabel("Leg 1 summary")).toContainText("not your current emergency location");
  await page.reload();
  await expect(page.getByRole("region", { name: "Travel legs" })).toContainText("Arrival Airport Terminal → Harbour Hotel");
  await page.getByRole("button", { name: /^1\s*Plan$/ }).click();
  await expect(page.getByRole("textbox", { name: "From" })).toHaveValue("Arrival Airport Terminal");
  await page.getByRole("button", { name: "Return & legs" }).click();
  await page.getByText("Destination facts for leg 1", { exact: true }).click();
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
  await page.goto("/plan/legs");
  await page.getByRole("button", { name: "Return & legs" }).click();
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
  await page.getByText("Requirements and destination facts for leg 2", { exact: true }).click();
  await page.getByLabel("Destination country for leg 2").selectOption("GH");
  await expect(page.getByLabel("Leg 2", { exact: true })).toContainText("emergency information partly verified");
  await expect(page.getByLabel("Leg 2", { exact: true })).toContainText("Operator availability, property access and staffing remain unknown");
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
  await page.getByText("Requirements and destination facts for leg 3", { exact: true }).click();
  await page.getByLabel("Destination country for leg 3").selectOption("AF");
  await expect(page.getByLabel("Leg 3", { exact: true })).toContainText("Local emergency number for this destination is not verified");
  await expect(page.getByLabel("Leg 3 to")).toHaveValue("Unavailable Hotel");
  await page.reload();
  await page.getByRole("button", { name: "Return & legs" }).click();
  await page.getByRole("button", { name: "Edit leg 2" }).click();
  await expect(page.getByLabel("Leg 2 IANA time zone")).toHaveValue("Europe/London");
  await page.getByRole("button", { name: "Edit leg 3" }).click();
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
  await page.goto("/plan/legs");
  await page.getByRole("button", { name: "Return & legs" }).click();
  await expect(page.getByLabel("Leg 2", { exact: true })).toContainText("Return from event");
  await page.getByRole("button", { name: "Review leg 2 options" }).click();
  await expect(page).toHaveURL(/\/plan(\/legs)?\?planStep=options$/);
  await expect(page.getByRole("region", { name: "Plan options" })).toBeVisible();
  await page.getByRole("button", { name: /^1\s*Plan$/ }).click();
  await expect(page.getByRole("region", { name: "Plan state" })).toContainText("Return from event");
  await page.getByRole("button", { name: "Return & legs" }).click();
  await expect(page.getByLabel("Leg 2", { exact: true })).toContainText("Arrive at event");
});

test("S4 reverse leg prefill needs a new departure and retains the explicitly chosen editable zone", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("mira.welcomed", "1");
    const place = (query: string, lat: number) => ({ query, resolution: { source: "search", name: query, point: { lat, lon: 77.21 } } });
    sessionStorage.setItem("mira.plan.v1", JSON.stringify({ savedAt: Date.now(), draft: { version: 1, touched: true, activity: "Arrive at event", origin: { kind: "named", ...place("Station", 28.69) }, destination: place("Venue", 28.70), loop: false, departureLocal: "2026-10-03T18:00", timeZone: "Asia/Kolkata", mode: "walk", constraints: "", destinationCountryIso: null, legs: [] } }));
  });
  await page.goto("/plan/legs");
  await page.getByRole("button", { name: "Return & legs" }).click();
  await page.getByRole("button", { name: "Add return leg" }).click();
  await expect(page.getByLabel("Leg 2 from")).toHaveValue("Venue");
  await expect(page.getByLabel("Leg 2 to")).toHaveValue("Station");
  await expect(page.getByLabel("Leg 2 local departure")).toHaveValue("");
  await expect(page.getByLabel("Leg 2 IANA time zone")).toHaveValue("Asia/Kolkata");
  await expect(page.getByRole("button", { name: "Review leg 2 options" })).toBeDisabled();
  expect((await page.evaluate(() => JSON.parse(sessionStorage.getItem("mira.plan.v1") ?? "null")?.draft?.legs?.[0]?.destinationCountryIso))).toBeNull();
});

test("S4 arrival check-in and explicit return are two private confirmed journeys", async ({ browser }) => {
  const owner = await newUser(browser, "Tara");
  const station = { lat: GEO.latitude, lon: GEO.longitude };
  const venue = { lat: GEO.latitude + 0.004, lon: GEO.longitude + 0.002 };
  await owner.page.evaluate(({ station, venue }) => {
    const local = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date()).replace(" ", "T");
    const place = (query: string, point: { lat: number; lon: number }) => ({ query, resolution: { source: "search", name: query, point } });
    sessionStorage.setItem("mira.plan.v1", JSON.stringify({ savedAt: Date.now(), draft: { version: 1, touched: true, activity: "Arrive at event", origin: { kind: "named", ...place("Station", station) }, destination: place("Venue", venue), loop: false, departureLocal: local, timeZone: "Asia/Kolkata", mode: "walk", constraints: "", legs: [{ label: "Return to Station", origin: place("Venue", venue), destination: place("Station", station), departureLocal: local, timeZone: "Asia/Kolkata", mode: "walk", destinationCountryIso: null }] } }));
  }, { station, venue });
  await owner.page.route("**/api/plan/options", async (route) => {
    const { intent } = route.request().postDataJSON() as { intent: MovementIntent };
    await route.fulfill({ json: fixtureOptions(intent) });
  });
  await owner.page.goto("/plan?planStep=options");
  await owner.page.getByRole("radio", { name: "Use foreground location" }).check();
  await owner.page.getByRole("button", { name: "Start chosen journey" }).click();
  await expect(owner.page.getByText("Nobody is notified.", { exact: false })).toBeVisible();
  // Location is on for her, so a watch is running; static Chromium GPS can then fail the start's maximumAge:0 request.
  // TEST-ONLY: answer that one request with a fresh fix at the station (native GPS is restored right after).
  await owner.page.evaluate((point) => {
    const gps = navigator.geolocation;
    const native = gps.getCurrentPosition.bind(gps);
    gps.getCurrentPosition = (success) => {
      gps.getCurrentPosition = native;
      const coords = { latitude: point.lat, longitude: point.lon, accuracy: 10, altitude: null, altitudeAccuracy: null, heading: null, speed: null, toJSON() { return { latitude: point.lat, longitude: point.lon, accuracy: 10 }; } };
      const timestamp = Date.now();
      success({ coords, timestamp, toJSON() { return { coords: coords.toJSON(), timestamp }; } } as GeolocationPosition);
    };
  }, station);
  await owner.page.getByRole("button", { name: "Confirm start" }).click();
  await owner.page.waitForURL("**/trip");
  await owner.ctx.setGeolocation({ latitude: venue.lat, longitude: venue.lon });
  await owner.page.getByRole("button", { name: "I'm here" }).first().click();
  await expect(owner.page.getByRole("heading", { name: "You made it." })).toBeVisible();
  const arrived = (await (await owner.page.request.get("/api/trips/current")).json()).trip;
  expect(arrived).toMatchObject({ state: "arrived", sharedWith: [] });
  await owner.page.getByRole("button", { name: "Review return journey" }).click();
  // The return opens in Plan, as its own brief; the arrival leg stays with it.
  await expect(owner.page).toHaveURL(/\/plan$/);
  await expect(owner.page.getByRole("heading", { level: 1, name: "To Station" })).toBeVisible();
  const retained = await owner.page.evaluate(() => JSON.parse(sessionStorage.getItem("mira.plan.v1") ?? "null")?.draft);
  expect(retained.origin.query).toBe("Venue"); expect(retained.destination.query).toBe("Station");
  expect(retained.legs[0].label).toBe("Arrive at event");
  expect(retained.timeZone).toBe("Asia/Kolkata");
  expect((await (await owner.page.request.get("/api/trips/current")).json()).trip).toMatchObject({ id: arrived.id, state: "arrived" });
  await owner.page.getByRole("button", { name: /^(Go with Mira|Go now)$/ }).click();
  const go = owner.page.getByRole("dialog", { name: "Go with Mira" });
  await expect(go).toContainText("Nobody is contacted.");
  expect((await (await owner.page.request.get("/api/trips/current")).json()).trip).toMatchObject({ id: arrived.id, state: "arrived" });
  await go.getByRole("button", { name: "Start — just me" }).click();
  await owner.page.waitForURL("**/trip");
  const returning = (await (await owner.page.request.get("/api/trips/current")).json()).trip;
  expect(returning.id).not.toBe(arrived.id);
  expect(returning.destination.name).toBe("Station");
  expect(returning.sharedWith).toEqual([]);
  await owner.ctx.setGeolocation({ latitude: station.lat, longitude: station.lon });
  await owner.page.getByRole("button", { name: "I'm here" }).first().click();
  await expect(owner.page.getByRole("heading", { name: "You made it." })).toBeVisible();
  await owner.ctx.close();
});
