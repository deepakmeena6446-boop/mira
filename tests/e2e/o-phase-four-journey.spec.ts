import { expect, test } from "@playwright/test";
import { GEO, newUser, openRoute } from "./helpers";

test("active journey resumes with truthful position age and immediate support", async ({ browser }) => {
  const owner = await newUser(browser, "Leena");
  await openRoute(owner.page);
  await owner.page.getByRole("button", { name: /Go with Mira/ }).click();
  await owner.page.waitForURL("**/trip");
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
  await expect(owner.page.getByRole("status").filter({ hasText: "Last position shared" })).toBeVisible();
  await owner.page.getByRole("button", { name: "I feel unsafe" }).click();
  const sheet = owner.page.getByRole("dialog", { name: "Right now" });
  await expect(sheet.getByRole("link", { name: /Emergency call/ })).toBeVisible();
  await expect(sheet).toContainText("route unverified");
  await sheet.getByRole("button", { name: /Go to a Help Point/ }).click();
  await owner.page.route("**/api/plan/options", async (route) => {
    const body = route.request().postDataJSON() as { from: { lat: number; lon: number }; to: { lat: number; lon: number } };
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ state: "ready", checkedAt: new Date().toISOString(), source: "OpenStreetMap imported walking graph", sourceAt: new Date().toISOString(), scope: "test route", options: [{ id: "walk-0", label: "Mapped walk", minutes: 7, meters: 520, geometry: [[body.from.lon, body.from.lat], [body.to.lon, body.to.lat]], evidence: [{ status: "known", claim: "Mapped walking time", value: 7, scope: { kind: "route", ref: "test" }, source: { id: "osm", label: "OpenStreetMap imported walking graph", observedAt: new Date().toISOString(), expiresAt: null } }] }], daylight: { status: "unknown", claim: "Daylight", scope: { kind: "area", ref: "test" }, reason: "not_checked", retryable: false }, service: { status: "unknown", claim: "Service", scope: { kind: "route", ref: "test" }, reason: "unsupported", retryable: false }, detail: "Mapped walk." }) });
  });
  await owner.page.getByRole("button", { name: "Check mapped walk to this place" }).click();
  await expect(owner.page.getByRole("status").filter({ hasText: "Mapped walk from the checked position" })).toContainText("Access, staffing and opening remain unverified");
  await owner.page.getByRole("button", { name: "Change journey to this place" }).click();
  await expect(owner.page.getByText(/Your existing contacts and live link stay the same/)).toBeVisible();
  await owner.page.getByRole("button", { name: "Confirm change" }).click();
  await expect(owner.page.getByText(/Journey change saved/)).toBeVisible();
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
  await owner.page.goto("/around/map");
  await expect(owner.page.getByRole("button", { name: "Start chosen walk" })).toBeVisible();
  const before = await (await owner.page.request.get("/api/trips/current")).json();
  expect(before.trip).toBeNull();
  await owner.page.getByRole("button", { name: "Start chosen walk" }).click();
  await expect(owner.page.getByRole("button", { name: "Confirm start" })).toBeVisible();
  const stillBefore = await (await owner.page.request.get("/api/trips/current")).json();
  expect(stillBefore.trip).toBeNull();
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
  await owner.page.goto("/around/map");
  await expect(owner.page.getByText("No loop route or walking time is verified.")).toBeVisible();
  await expect(owner.page.getByRole("button", { name: "Start manual loop check-in" })).toBeVisible();
  expect((await (await owner.page.request.get("/api/trips/current")).json()).trip).toBeNull();
  await owner.page.getByRole("button", { name: "Start manual loop check-in" }).click();
  await expect(owner.page.getByRole("button", { name: "Confirm loop check-in" })).toBeVisible();
  await owner.page.getByRole("button", { name: "Confirm loop check-in" }).click();
  await expect(owner.page.getByText("A recent, accurate device position is needed to start.", { exact: false })).toBeVisible();
  expect((await (await owner.page.request.get("/api/trips/current")).json()).trip).toBeNull();
  await owner.ctx.grantPermissions(["geolocation"]);
  await owner.page.getByRole("button", { name: "Confirm loop check-in" }).click();
  await owner.page.waitForURL("**/trip");
  await expect(owner.page.getByRole("heading", { name: "Sharing where you are" })).toBeVisible();
  const active = (await (await owner.page.request.get("/api/trips/current")).json()).trip;
  expect(active.autoArrival).toBe(false);
  expect(active.sharedWith).toEqual([]);
  await owner.ctx.close();
});
