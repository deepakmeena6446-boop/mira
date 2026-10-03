import { expect, test } from "@playwright/test";
import { newUser } from "./helpers";

test("signed-in Ask starts a temporary movement plan without legacy chat or GPS", async ({ browser }) => {
  const owner = await newUser(browser, "Asha");
  let legacyPosts = 0;
  let planPosts = 0;
  let geoRequests = 0;
  await owner.page.route("**/api/mira", async (route) => { if (route.request().method() === "POST") legacyPosts++; await route.continue(); });
  await owner.page.route("**/api/mira/plan", async (route) => { planPosts++; await route.continue(); });
  await owner.ctx.addInitScript(() => {
    const original = navigator.geolocation.getCurrentPosition.bind(navigator.geolocation);
    navigator.geolocation.getCurrentPosition = (...args) => { (window as Window & { miraGeoCalls?: number }).miraGeoCalls = ((window as Window & { miraGeoCalls?: number }).miraGeoCalls ?? 0) + 1; return original(...args); };
  });
  await owner.page.goto("/mira");
  await owner.page.getByLabel("Message Mira").fill("Run a loop from North Gate at 4:45 AM");
  await owner.page.getByRole("button", { name: "Send" }).click();
  await expect(owner.page.getByRole("log", { name: "Conversation with Mira" })).toContainText("I have North Gate");
  await expect(owner.page.getByRole("log", { name: "Conversation with Mira" })).not.toContainText("Which starting place should I use?");
  const draft = await owner.page.evaluate(() => JSON.parse(sessionStorage.getItem("mira.plan.v1") ?? "null")?.draft);
  expect(draft.timeHint).toBe("4:45 AM");
  expect(draft.departureLocal).toBe("");
  expect(draft.timeZone).toBe("");
  expect(legacyPosts).toBe(0);
  expect(planPosts).toBe(1);
  geoRequests = await owner.page.evaluate(() => (window as Window & { miraGeoCalls?: number }).miraGeoCalls ?? 0);
  expect(geoRequests).toBe(0);
  await owner.ctx.close();
});

test("guest Ask gives a useful late-arrival partial answer and keeps a draft without sign-in", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("mira.welcomed", "1"));
  await page.goto("/mira");
  await page.getByLabel("Message Mira").fill("I'm landing in London at 1:30 AM");
  await page.getByRole("button", { name: "Send" }).click();
  const log = page.getByRole("log", { name: "Conversation with Mira" });
  await expect(log).toContainText("Which airport or station are you arriving at?");
  await expect(log.getByRole("region", { name: "Plan evidence" })).toContainText("Route check not started");
  await expect(log.getByRole("link", { name: "Complete plan" })).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem("mira.plan.v1"))).toContain("landing in London");
});

test("early-run wording seeds an unresolved loop without guessing a time zone", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("mira.welcomed", "1"));
  await page.goto("/mira");
  await page.getByLabel("Message Mira").fill("Run a loop from North Gate at 4:45 AM");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByRole("log", { name: "Conversation with Mira" })).toContainText("I have North Gate");
  await expect(page.getByRole("log", { name: "Conversation with Mira" })).not.toContainText("Which starting place should I use?");
  const draft = await page.evaluate(() => JSON.parse(sessionStorage.getItem("mira.plan.v1") ?? "null")?.draft);
  expect(draft.loop).toBe(true);
  expect(draft.origin.query).toBe("North Gate");
  expect(draft.origin.resolution).toBeNull();
  expect(draft.departureLocal).toBe("");
  expect(draft.timeZone).toBe("");
});

test("Ask uses the selected plan and an ephemeral sourced response", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("mira.welcomed", "1");
    sessionStorage.setItem("mira.plan.v1", JSON.stringify({ savedAt: Date.now(), draft: { version: 1, touched: true, activity: "Walk home", origin: { kind: "named", query: "Office", resolution: { source: "search", name: "Office", point: { lat: 28.69, lon: 77.21 } } }, destination: { query: "Home", resolution: { source: "search", name: "Home", point: { lat: 28.691, lon: 77.211 } } }, loop: false, departureLocal: "2026-10-02T21:00", timeZone: "Asia/Kolkata", mode: "walk", constraints: "" } }));
  });
  let sentPlan = false;
  let legacyPosts = 0;
  await page.route("**/api/mira", async (route) => { if (route.request().method() === "POST") legacyPosts++; await route.continue(); });
  await page.route("**/api/mira/plan", async (route) => {
    const body = route.request().postDataJSON() as { message: string; plan: { origin: { query: string }; departure: { local: string } } };
    sentPlan = body.plan.origin.query === "Office" && body.plan.departure.local === "2026-10-02T21:00";
    await route.fulfill({ status: 200, contentType: "application/x-ndjson", body: [{ type: "text", delta: "The mapped walk is about 8 minutes. Source: OpenStreetMap snapshot 2026-09-24. Future service is unverified." }, { type: "card", card: { type: "plan_brief", next: "review_options", state: "ready", checkedAt: "2026-10-02T12:00:00.000Z", source: "OpenStreetMap imported walking graph", sourceAt: "2026-09-24T18:11:11.000Z", scope: "route fixture", options: [{ id: "walk-0", label: "Shortest mapped walk", minutes: 8, meters: 600 }], daylight: { status: "known", claim: "Daylight at departure", value: "dark", scope: { kind: "area", ref: "origin" }, source: { id: "noaa", label: "NOAA calculation", observedAt: "2026-10-02T12:00:00.000Z", expiresAt: null } } } }, { type: "done" }].map((e) => JSON.stringify(e)).join("\n") + "\n" });
  });
  await page.goto("/mira");
  await page.getByLabel("Message Mira").fill("What about this plan?");
  await page.getByRole("button", { name: "Send" }).click();
  const log = page.getByRole("log", { name: "Conversation with Mira" });
  await expect(log).toContainText("OpenStreetMap snapshot 2026-09-24");
  await expect(log.getByRole("link", { name: "Review options" })).toBeVisible();
  expect(sentPlan).toBe(true);
  expect(legacyPosts).toBe(0);
});

test("guest danger message shows Emergency before any plan answer", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("mira.welcomed", "1"));
  let processingPosts = 0;
  page.on("request", (request) => { if (request.method() === "POST" && new URL(request.url()).pathname.startsWith("/api/mira")) processingPosts++; });
  await page.goto("/mira");
  await page.getByLabel("Message Mira").fill("Someone is following me");
  await page.getByRole("button", { name: "Send" }).click();
  const support = page.getByRole("dialog", { name: "Right now" });
  await expect(support).toBeVisible();
  await expect(support.getByLabel("Immediate Emergency action").getByRole("button", { name: "Emergency options" })).toBeVisible();
  await expect(support.getByRole("button", { name: "Call someone", exact: true })).toBeVisible();
  await expect(support).toContainText("Turn on location to see Help Points near you.");
  expect(processingPosts).toBe(0);
  expect(await page.evaluate(() => sessionStorage.getItem("mira.plan.v1"))).toBeNull();
});

test("active plan keeps informational tools separate from movement Ask", async ({ browser }) => {
  const owner = await newUser(browser, "Maya");
  await owner.page.evaluate(() => {
    sessionStorage.setItem("mira.plan.v1", JSON.stringify({ savedAt: Date.now(), draft: { version: 1, touched: true, activity: "Walk home", origin: { kind: "named", query: "Office", resolution: null }, destination: { query: "Home", resolution: null }, loop: false, departureLocal: "", timeZone: "", mode: "walk", constraints: "" } }));
  });
  let legacyPosts = 0;
  let planPosts = 0;
  let nearbyLocationSupplied = false;
  await owner.page.route("**/api/mira", async (route) => {
    if (route.request().method() === "POST") {
      legacyPosts++;
      const body = route.request().postDataJSON() as { message: string; context?: { location?: { lat: number; lon: number } | null } };
      if (body.message === "What's open nearby?") nearbyLocationSupplied = Boolean(body.context?.location);
    }
    await route.continue();
  });
  await owner.page.route("**/api/mira/plan", async (route) => { planPosts++; await route.continue(); });
  await owner.page.goto("/mira");
  const useLocation = owner.page.getByRole("button", { name: "Use current location for nearby questions" });
  await expect(useLocation).toBeVisible();
  await useLocation.click();
  await expect(useLocation).toBeHidden();
  for (const [question, expected] of [["What can you do?", "I can find nearby places"], ["How do I report a broken streetlight?", "report"], ["What's open nearby?", "nearby"]] as const) {
    await owner.page.getByLabel("Message Mira").fill(question);
    await owner.page.getByRole("button", { name: "Send" }).click();
    await expect(owner.page.getByRole("log", { name: "Conversation with Mira" })).toContainText(expected);
    await expect(owner.page.getByRole("log", { name: "Conversation with Mira" }).locator('[aria-label="Mira is typing"]')).toHaveCount(0);
  }
  expect(legacyPosts).toBe(3);
  expect(nearbyLocationSupplied).toBe(true);
  expect(planPosts).toBe(0);
  await owner.page.getByLabel("Message Mira").fill("What is the emergency number in India?");
  await owner.page.getByRole("button", { name: "Send" }).click();
  await expect(owner.page.getByRole("log", { name: "Conversation with Mira" })).toContainText("For India, MIRA's reviewed emergency profile lists");
  expect(planPosts).toBe(1);
  expect(legacyPosts).toBe(3);
  await owner.ctx.close();
});
