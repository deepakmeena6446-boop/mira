import { expect, test, type Page } from "@playwright/test";
import type { MovementIntent } from "../../src/domain/plan-contract";
import type { PlanDraft } from "../../src/domain/plan-state";
import { fixtureOptions } from "./plan-fixtures";

test.use({ serviceWorkers: "block", timezoneId: "Asia/Kolkata" });
const ZONE = "Asia/Kolkata";
const EVENT = "Fictional dinner with friends";
const HOME = "Fictional Courtyard";
const VENUE = "Fictional Dinner Venue";
const RETURN = `Return to ${HOME}`;
const FICTIONAL_RECIPIENT = "11111111-1111-4111-8111-111111111111";
const format = (date: Date) => new Intl.DateTimeFormat("sv-SE", { timeZone: ZONE, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(date).replace(" ", "T");

async function forbidGps(page: Page) {
  let calls = 0;
  await page.exposeBinding("longNightUnexpectedGps", () => { calls++; });
  await page.addInitScript(() => {
    const unexpected = () => { void (window as unknown as { longNightUnexpectedGps: () => Promise<void> }).longNightUnexpectedGps(); throw new Error("Unexpected GPS in private saved-return review"); };
    Object.defineProperty(navigator.geolocation, "getCurrentPosition", { configurable: true, value: unexpected });
    Object.defineProperty(navigator.geolocation, "watchPosition", { configurable: true, value: unexpected });
  });
  return () => calls;
}

// Actual owner-scoped save/read APIs and local timers; fictional plan/graph and simulated clock.
// No claim about a live route, operating service, safety outcome, or physical-phone behavior.
test("S4 a saved midnight return survives a real three-hour draft expiry and needs a fresh private start", async ({ page, context }) => {
  await context.clearPermissions();
  const gpsCalls = await forbidGps(page);
  const today = new Intl.DateTimeFormat("sv-SE", { timeZone: ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const evening = new Date(`${today}T21:00:00+05:30`);
  const midnight = new Date(evening.getTime() + 190 * 60_000);
  // Install actual fake timers before navigation. fastForward below fires the expiry callback;
  // merely changing Date.now with setFixedTime would not establish in-memory expiry.
  await page.clock.install({ time: evening });
  const effects: string[] = [];
  page.on("request", (request) => {
    if (request.method() !== "POST") return;
    const path = new URL(request.url()).pathname;
    if (path === "/api/trips" || /^\/api\/trips\/[^/]+\/(share|checkon)$/.test(path)) effects.push(path);
  });
  const comparisons: MovementIntent[] = [];
  await page.route("**/api/plan/options", async (route) => {
    const { intent } = route.request().postDataJSON() as { intent: MovementIntent };
    comparisons.push(intent);
    const returning = intent.activity === RETURN;
    await route.fulfill({ json: fixtureOptions(intent, [{ id: returning ? "fixture-fresh-midnight-return" : "fixture-dinner-walk", label: returning ? "Fixture midnight return" : "Fixture dinner walk", minutes: 12, meters: 850 }]) });
  });

  // Real local demo sign-in through the UI; no location opt-in, emails or contact setup.
  await page.goto("/me");
  await page.getByRole("button", { name: "Get started" }).click();
  await page.getByPlaceholder("Your first name").fill("NightSaved");
  await page.getByRole("dialog").getByRole("checkbox", { name: /I confirm I.m 18 or older/ }).check();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  const place = (query: string, lat: number) => ({ query, resolution: { source: "search" as const, name: query, placeId: `fictional:${query}`, point: { lat, lon: 77.21 } } });
  const draft: PlanDraft = {
    version: 2, touched: true, activity: EVENT, origin: { kind: "named", ...place(HOME, 28.69) }, destination: place(VENUE, 28.70),
    loop: false, departureLocal: format(evening), timeZone: ZONE, mode: "walk", constraints: "Confirm access directly", timeKind: "depart_at",
    // A versioned fictional preference is not an accepted contact, a recipient selection or permission to send.
    journeyMode: "manual", recipientIds: [FICTIONAL_RECIPIENT], destinationCountryIso: "IN",
    legs: [{ label: RETURN, origin: place(VENUE, 28.70), destination: place(HOME, 28.69), departureLocal: format(midnight), timeZone: ZONE, mode: "walk", timeKind: "depart_at", constraints: "Confirm late access directly", destinationCountryIso: "IN" }],
  };
  await page.evaluate((draft) => sessionStorage.setItem("mira.plan.v1", JSON.stringify({ savedAt: Date.now(), draft })), draft);
  await page.goto("/plan");
  await page.getByRole("button", { name: "Return & legs" }).click();
  await expect(page.getByRole("region", { name: "Keep this return plan" })).toContainText("expires two hours");
  const savedResponse = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/me/plans" && response.request().method() === "POST");
  await page.getByRole("button", { name: "Save plan and return", exact: true }).click();
  const saved = await savedResponse;
  expect(saved.status()).toBe(201);
  const savedPlan = (await saved.json()).plan as { id: string; draft: PlanDraft };
  expect(savedPlan.draft).toMatchObject({ activity: EVENT, recipientIds: [FICTIONAL_RECIPIENT], legs: [expect.objectContaining({ label: RETURN, departureLocal: format(midnight), timeZone: ZONE })] });
  await expect(page.getByRole("status").filter({ hasText: "Saved to Journeys for 30 days" })).toBeVisible();
  expect(effects).toEqual([]); expect(gpsCalls()).toBe(0);

  await page.getByRole("button", { name: /^2\s*Options$/ }).click();
  await expect(page.getByRole("button", { name: /Fixture dinner walk/ })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Start chosen journey" }).click();
  expect(await page.evaluate(() => sessionStorage.getItem("mira.local-check-in.v1"))).toBeNull();
  await page.getByRole("button", { name: "Confirm start" }).click();
  await expect(page).toHaveURL(/\/trip\/local$/);
  const outgoingTimer = await page.evaluate(() => JSON.parse(sessionStorage.getItem("mira.local-check-in.v1")!));
  await page.getByRole("button", { name: "I’m here — confirm arrival" }).click();
  await expect(page.getByRole("heading", { name: "You’ve arrived." })).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem("mira.plan.v1"))).not.toBeNull();
  expect(await page.evaluate(() => sessionStorage.getItem("mira.local-check-in.v1"))).toBeNull();

  // A three-hour dinner crosses the draft's two-hour deadline. Prove removal before reload,
  // rather than writing an expired session or retaining an unexpired in-memory plan.
  await page.clock.fastForward(190 * 60_000);
  expect(await page.evaluate(() => sessionStorage.getItem("mira.plan.v1"))).toBeNull();
  await expect(page.getByRole("button", { name: "Review return journey", exact: true })).toHaveCount(0);
  await page.reload();
  expect(await page.evaluate(() => sessionStorage.getItem("mira.plan.v1"))).toBeNull();
  const beforeRestore = comparisons.length;
  await page.getByRole("button", { name: "Choose a saved return plan", exact: true }).click();
  const savedReturns = page.getByRole("region", { name: "Saved return plans" });
  const choice = savedReturns.getByRole("listitem").filter({ hasText: EVENT });
  await expect(choice).toContainText(`${VENUE} → ${HOME}`);
  await expect(choice).toContainText(format(midnight).replace("T", " "));
  await expect(choice).toContainText(ZONE);
  expect(effects).toEqual([]); expect(gpsCalls()).toBe(0);
  await choice.getByRole("button", { name: `Review saved return: ${RETURN}`, exact: true }).click();
  await expect(page).toHaveURL(/\/plan\?planStep=options$/);
  await expect(page.getByRole("button", { name: /Fixture midnight return/ })).toHaveAttribute("aria-pressed", "true");
  expect(comparisons.length).toBeGreaterThan(beforeRestore);
  expect(comparisons.at(-1)).toMatchObject({ activity: RETURN, origin: { kind: "named", query: VENUE }, destination: { query: HOME }, departure: { local: format(midnight), timeZone: ZONE } });
  await page.getByRole("button", { name: /Fixture midnight return/ }).click(); // An explicit new choice belongs to this fresh comparison.
  const restored = await page.evaluate(() => JSON.parse(sessionStorage.getItem("mira.plan.v1")!).draft as PlanDraft);
  expect(restored).toMatchObject({ activity: RETURN, origin: { query: VENUE }, destination: { query: HOME }, departureLocal: format(midnight), timeZone: ZONE, journeyMode: "manual", recipientIds: [FICTIONAL_RECIPIENT], legs: [expect.objectContaining({ label: EVENT, departureLocal: format(evening), timeZone: ZONE })] });
  expect(restored.selection?.optionId).toBe("fixture-fresh-midnight-return");
  expect(await page.evaluate(() => sessionStorage.getItem("mira.local-check-in.v1"))).toBeNull();
  expect(effects).toEqual([]); expect(gpsCalls()).toBe(0);
  await page.getByRole("button", { name: "Start chosen journey" }).click();
  await expect(page.getByRole("button", { name: "Confirm start" })).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem("mira.local-check-in.v1"))).toBeNull();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(await page.evaluate(() => sessionStorage.getItem("mira.local-check-in.v1"))).toBeNull();
  await page.getByRole("button", { name: "Start chosen journey" }).click();
  await page.getByRole("button", { name: "Confirm start" }).click();
  await expect(page).toHaveURL(/\/trip\/local$/);
  await expect(page.getByRole("heading", { name: HOME, exact: true })).toBeVisible();
  const returnTimer = await page.evaluate(() => JSON.parse(sessionStorage.getItem("mira.local-check-in.v1")!));
  expect(returnTimer.startedAt - outgoingTimer.startedAt).toBeGreaterThanOrEqual(190 * 60_000);
  expect(returnTimer.dueAt - returnTimer.startedAt).toBe(12 * 60_000);
  await page.getByRole("button", { name: "I’m here — confirm arrival" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Arrival was confirmed by you" })).toContainText("Nothing was sent to contacts");
  expect(effects).toEqual([]); expect(gpsCalls()).toBe(0);
  // The owner still retains the explicitly saved dinner/return; restore did not mutate it.
  const retained = (await (await page.request.get("/api/me/plans")).json()).plans as { id: string; draft: PlanDraft }[];
  expect(retained.find((plan) => plan.id === savedPlan.id)?.draft).toEqual(savedPlan.draft);
});
