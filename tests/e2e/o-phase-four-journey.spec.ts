import { expect, test, type Page } from "@playwright/test";
import { GEO, newUser, openRoute, openJourneyMore } from "./helpers";

/** TEST-ONLY one-acquisition fixture. Static Chromium GPS can time out for maximumAge:0
 * while a watch holds its previous fix; reconfiguring CDP mid-request can reject it with code2.
 * Native start/watch/reload stay exercised. These callbacks test explicit failed→fresh recovery;
 * they are neither physical-phone evidence nor proof of a real route. Restore native first. */
async function nextReviewAcquisition(page: Page, kind: "timeout" | "fresh") {
  await page.evaluate(({ point, kind }) => {
    const gps = navigator.geolocation;
    const native = gps.getCurrentPosition.bind(gps);
    gps.getCurrentPosition = (success, failure) => {
      gps.getCurrentPosition = native;
      if (kind === "timeout") return failure?.({ code: 3, message: "Deterministic acquisition timeout fixture", PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 });
      const coords = { ...point, accuracy: 10, altitude: null, altitudeAccuracy: null, heading: null, speed: null, toJSON() { return { ...point, accuracy: 10 }; } };
      const timestamp = Date.now();
      success({ coords, timestamp, toJSON() { return { coords: coords.toJSON(), timestamp }; } });
    };
  }, { point: GEO, kind });
}

test("active journey resumes with truthful position age and immediate support", async ({ browser }) => {
  const owner = await newUser(browser, "Leena");
  await openRoute(owner.page);
  await owner.page.getByRole("button", { name: /Go with Mira/ }).click();
  await owner.page.waitForURL("**/trip");
  await openJourneyMore(owner.page);
  await expect(owner.page.getByRole("status").filter({ hasText: "Last position shared" })).toBeVisible();
  await expect(owner.page.getByText("Only people you send your live link to can follow.")).toBeVisible();
  await owner.page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(owner.page.getByRole("status").filter({ hasText: "This screen is hidden; location updates are paused." })).toBeVisible();
  await owner.page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(owner.page.getByRole("status").filter({ hasText: "Foreground location is on" })).toBeVisible();
  await owner.page.reload();
  await openJourneyMore(owner.page);
  await expect(owner.page.getByRole("status").filter({ hasText: "Last position shared" })).toBeVisible();
  await owner.page.getByRole("button", { name: "I feel unsafe" }).click();
  const sheet = owner.page.getByRole("dialog", { name: "Right now" });
  await expect(sheet.getByLabel("Immediate Emergency action").getByRole("link", { name: /Emergency call/ })).toBeVisible();
  await expect(sheet).toContainText("route unverified");
  await sheet.getByRole("button", { name: /Go to a Help Point/ }).click();
  let routeRequests = 0;
  await owner.page.route("**/api/plan/options", async (route) => {
    routeRequests++;
    const body = route.request().postDataJSON() as { from: { lat: number; lon: number }; to: { lat: number; lon: number } };
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ state: "ready", checkedAt: new Date().toISOString(), source: "OpenStreetMap imported walking graph", sourceAt: new Date().toISOString(), scope: "test route", options: [{ id: "walk-0", label: "Mapped walk", minutes: 7, meters: 520, geometry: [[body.from.lon, body.from.lat], [body.to.lon, body.to.lat]], evidence: [{ status: "known", claim: "Mapped walking time", value: 7, scope: { kind: "route", ref: "test" }, source: { id: "osm", label: "OpenStreetMap imported walking graph", observedAt: new Date().toISOString(), expiresAt: null } }] }], daylight: { status: "unknown", claim: "Daylight", scope: { kind: "area", ref: "test" }, reason: "not_checked", retryable: false }, service: { status: "unknown", claim: "Service", scope: { kind: "route", ref: "test" }, reason: "unsupported", retryable: false }, detail: "Mapped walk." }) });
  });
  await nextReviewAcquisition(owner.page, "timeout");
  await owner.page.getByRole("button", { name: "Check mapped walk to this place" }).click();
  await expect(owner.page.getByText("A recent, accurate position is needed to check a route to this place.", { exact: true })).toBeVisible();
  expect(routeRequests).toBe(0); // Never reuse the retained watch point after explicit acquisition fails.
  await nextReviewAcquisition(owner.page, "fresh");
  await owner.page.getByRole("button", { name: "Check mapped walk to this place" }).click();
  await expect(owner.page.getByRole("status").filter({ hasText: "Mapped walk from the checked position" })).toContainText("Access, staffing and opening remain unverified");
  expect(routeRequests).toBe(1);
  await owner.page.getByRole("button", { name: "Change journey to this place" }).click();
  await expect(owner.page.getByText(/Your existing contacts and live link stay the same/)).toBeVisible();
  await owner.page.getByRole("button", { name: "Confirm change" }).click();
  await expect(owner.page.getByText(/Journey change saved/)).toBeVisible();
  const beforeTiming = (await (await owner.page.request.get("/api/trips/current")).json()).trip;
  await owner.page.getByRole("button", { name: "I feel unsafe" }).click();
  await sheet.getByRole("button", { name: /Review route or timing/ }).click();
  await expect(sheet).toBeHidden();
  await owner.page.getByLabel("Minutes from now until check-in").fill("20");
  expect((await (await owner.page.request.get("/api/trips/current")).json()).trip.etaAt).toBe(beforeTiming.etaAt);
  const confirmation = owner.page.waitForResponse((response) => response.request().method() === "POST" && response.url().endsWith(`/api/trips/${beforeTiming.id}/change`));
  await owner.page.getByRole("button", { name: "Confirm check-in time change", exact: true }).click();
  expect((await confirmation).ok()).toBe(true);
  const afterTiming = (await (await owner.page.request.get("/api/trips/current")).json()).trip;
  expect(afterTiming).toMatchObject({ id: beforeTiming.id, destination: beforeTiming.destination, shareUrl: beforeTiming.shareUrl, sharedWith: beforeTiming.sharedWith });
  expect(Math.abs(new Date(afterTiming.etaAt).getTime() - Date.now() - 20 * 60_000)).toBeLessThan(10_000);
  await owner.ctx.close();
});

test("a selected plan requires a separate start confirmation and proximity check", async ({ browser }) => {
  const owner = await newUser(browser, "Nina");
  const from = { lat: GEO.latitude, lon: GEO.longitude };
  const to = { lat: 28.6901, lon: 77.2111 };
  await owner.page.evaluate(({ from, to }) => {
    const local = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date()).replace(" ", "T");
    sessionStorage.setItem("mira.plan.v1", JSON.stringify({ savedAt: Date.now(), draft: { version: 1, touched: true, activity: "Walk to the library", origin: { kind: "named", query: "Start", resolution: { source: "search", name: "Start", point: from, placeId: "start" } }, destination: { query: "Library", resolution: { source: "search", name: "Library", point: to, placeId: "library" } }, loop: false, departureLocal: local, timeZone: "Asia/Kolkata", mode: "walk", constraints: "" } }));
  }, { from, to });
  await owner.page.route("**/api/plan/options", async (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ state: "ready", checkedAt: new Date().toISOString(), source: "OpenStreetMap imported walking graph", sourceAt: new Date().toISOString(), scope: "test route", options: [{ id: "walk-0", label: "Shortest mapped walk", minutes: 15, meters: 1000, geometry: [[from.lon, from.lat], [to.lon, to.lat]], evidence: [{ status: "known", claim: "Mapped walking time estimate", value: 15, scope: { kind: "route", ref: "test route" }, source: { id: "osm-walking-graph", label: "OpenStreetMap", observedAt: new Date().toISOString(), expiresAt: null } }] }], daylight: { status: "unknown", claim: "Daylight", scope: { kind: "area", ref: "test" }, reason: "not_checked", retryable: false }, service: { status: "unknown", claim: "Service", scope: { kind: "route", ref: "test" }, reason: "unsupported", retryable: false }, detail: "One mapped path." }) }));
  await owner.page.goto("/plan?planStep=options");
  await owner.page.getByRole("radio", { name: "Use foreground location" }).check();
  await expect(owner.page.getByRole("button", { name: "Start chosen journey" })).toBeVisible();
  const before = await (await owner.page.request.get("/api/trips/current")).json();
  expect(before.trip).toBeNull();
  await owner.page.getByRole("button", { name: "Start chosen journey" }).click();
  await expect(owner.page.getByRole("button", { name: "Confirm start" })).toBeVisible();
  const stillBefore = await (await owner.page.request.get("/api/trips/current")).json();
  expect(stillBefore.trip).toBeNull();
  await owner.ctx.setGeolocation({ latitude: 28.8, longitude: 77.3 });
  await owner.page.getByRole("button", { name: "Confirm start" }).click();
  await expect(owner.page.getByText("A fresh, accurate position near your chosen origin is needed.", { exact: false })).toBeVisible();
  expect((await (await owner.page.request.get("/api/trips/current")).json()).trip).toBeNull();
  await owner.ctx.setGeolocation(GEO);
  await owner.page.getByRole("button", { name: "Confirm start" }).click();
  await owner.page.waitForURL("**/trip");
  await expect(owner.page.getByText("Only people you send your live link to can follow.")).toBeVisible();
  await owner.ctx.close();
});

test("S1 loop offers a manual check-in, keeps location optional until confirmed, then starts without a route", async ({ browser }) => {
  const owner = await newUser(browser, "Riya");
  await owner.ctx.clearPermissions();
  await owner.page.evaluate((from) => {
    const local = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date()).replace(" ", "T");
    sessionStorage.setItem("mira.plan.v1", JSON.stringify({ savedAt: Date.now(), draft: { version: 1, touched: true, activity: "Early run", origin: { kind: "named", query: "North Gate", resolution: { source: "search", name: "North Gate", point: from, placeId: "north" } }, destination: { query: "", resolution: null }, loop: true, departureLocal: local, timeZone: "Asia/Kolkata", mode: "walk", constraints: "" } }));
  }, { lat: GEO.latitude, lon: GEO.longitude });
  await owner.page.route("**/api/plan/options", async (route) => route.fulfill({ json: { state: "missing", options: [], checkedAt: new Date().toISOString(), source: null, sourceAt: null, scope: "fixture", detail: "No mapped loop in this fixture", daylight: { status: "unknown", reason: "not_checked" }, service: { status: "unknown", reason: "unsupported" } } }));
  await owner.page.goto("/plan?planStep=options");
  await expect(owner.page.getByRole("status").filter({ hasText: "No mapped loop in this fixture" })).toBeVisible();
  await owner.page.getByRole("radio", { name: "Use foreground location" }).check();
  await expect(owner.page.getByRole("button", { name: "Start manual journey" })).toBeVisible();
  expect((await (await owner.page.request.get("/api/trips/current")).json()).trip).toBeNull();
  await owner.page.getByRole("button", { name: "Start manual journey" }).click();
  await expect(owner.page.getByRole("button", { name: "Confirm start" })).toBeVisible();
  await owner.page.getByRole("button", { name: "Confirm start" }).click();
  await expect(owner.page.getByText("A fresh, accurate position near your chosen origin is needed.", { exact: false })).toBeVisible();
  expect((await (await owner.page.request.get("/api/trips/current")).json()).trip).toBeNull();
  await owner.ctx.grantPermissions(["geolocation"]);
  await owner.page.getByRole("button", { name: "Confirm start" }).click();
  await owner.page.waitForURL("**/trip");
  await expect(owner.page.getByRole("heading", { name: "Sharing where you are" })).toBeVisible();
  const active = (await (await owner.page.request.get("/api/trips/current")).json()).trip;
  expect(active.autoArrival).toBe(false);
  expect(active.sharedWith).toEqual([]);
  await owner.ctx.close();
});
