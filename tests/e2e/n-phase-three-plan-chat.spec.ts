import { expect, test } from "@playwright/test";

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
  await expect(page.getByRole("log", { name: "Conversation with Mira" })).toContainText("Which starting place should I use?");
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
  await page.goto("/mira");
  await page.getByLabel("Message Mira").fill("Someone is following me");
  await page.getByRole("button", { name: "Send" }).click();
  const log = page.getByRole("log", { name: "Conversation with Mira" });
  await expect(log).toContainText("If you may be in danger, use Emergency now");
  await expect(log.getByText(/Mira doesn't call anyone for you/)).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem("mira.plan.v1"))).toBeNull();
});
