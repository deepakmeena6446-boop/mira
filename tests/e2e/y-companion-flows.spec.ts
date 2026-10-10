import { expect, test, type Page } from "@playwright/test";
import { DEST, SAME_ORIGIN, newUser, openRoute } from "./helpers";

// Sprint mira-companion-48h flows (simulation: Chromium emulation, local e2e stack, deterministic companion,
// sourced pilot import). Acceptance anchors: A04, A08, A24, A26, A27, A31 (UI copy).

async function pick(page: Page, field: RegExp, query: string) {
  await page.getByRole("region", { name: "Your plan", exact: true }).getByRole("button", { name: field }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("textbox").fill(query);
  await dialog.getByRole("button", { name: new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") }).first().click();
}

test("a guest plans between two named places without GPS and gets a short, qualified answer before the detail", async ({ page }) => {
  // Midday in Delhi: daylight for the whole walk, so the travel time leads (design/mira-companion-ux chooseTakeaway).
  await page.clock.setFixedTime(new Date("2026-10-10T06:30:00Z"));
  await page.addInitScript(() => {
    const state = window as unknown as { geoCalls: number };
    state.geoCalls = 0;
    Object.defineProperty(navigator.geolocation, "getCurrentPosition", { configurable: true, value: () => { state.geoCalls++; } });
    Object.defineProperty(navigator.geolocation, "watchPosition", { configurable: true, value: () => { state.geoCalls++; return 0; } });
  });
  await page.goto("/");
  await page.getByRole("link", { name: "Plan an outing" }).click();
  await pick(page, /^From/, "Hindu College");
  await pick(page, /^To/, DEST);
  // Her request is said back once: where from, when and how (the heading says where to).
  await expect(page.getByRole("region", { name: "Your plan", exact: true })).toContainText(/^Planning a walk.*From Hindu College/);
  // The takeaway carries its qualifier on the sky card; at most two more items follow, each qualified; never news.
  const sky = page.getByRole("region", { name: "Your plan, at that time" });
  await expect(sky).toContainText(/min walk/);
  await expect(sky).toContainText(/Estimate · Mapped route/);
  const take = page.getByRole("region", { name: "Mira’s take" });
  await expect(take.locator("li")).not.toHaveCount(0);
  expect(await take.locator("li").count()).toBeLessThanOrEqual(2);
  await expect(take).toContainText(/Calculated|Listed|From people|Not known|Couldn’t check/);
  await expect(take).not.toContainText(/report|indexed/i);
  await expect(sky).not.toContainText(/report|indexed/i);
  // The detail keeps everything, including what Mira can't see, one tap away; the map waits behind "View map".
  const checked = page.getByRole("region", { name: "What Mira checked" });
  await expect(checked).toContainText("What Mira can’t see");
  await expect(checked.getByText("Whether a Help Point is staffed", { exact: false })).toBeHidden();
  await checked.getByText(/\d+ checks/).click();
  await expect(checked.getByText("Whether a Help Point is staffed", { exact: false })).toBeVisible();
  await expect(page.getByRole("region", { name: /The chosen way/ })).toHaveCount(0);
  await take.getByRole("button", { name: "View map" }).click();
  await expect(take.getByRole("button", { name: "Hide map" })).toHaveAttribute("aria-expanded", "true");
  // Two actions in the bar, and saving is offered honestly to a guest.
  await expect(page.getByRole("button", { name: /^(Sign in to save|Go with Mira)$/ }).first()).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { geoCalls: number }).geoCalls)).toBe(0);
});

test("on foot in the dark, the calculated sky leads and the travel time keeps its qualifier in the list", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-10-10T17:30:00Z")); // 11 PM in Delhi
  await page.goto("/plan?for=go");
  await pick(page, /^From/, "Hindu College");
  await pick(page, /^To/, DEST);
  const sky = page.getByRole("region", { name: "Your plan, at that time" });
  await expect(sky).toContainText(/^.*Dark when you set off/);
  await expect(sky).toContainText(/Twilight from about \d{1,2}:\d{2} AM/); // the next change at 11 PM, on Delhi's clock
  await expect(sky).toContainText("Calculated · Solar calculation, not weather or visibility");
  await expect(sky).not.toContainText(/min walk/);
  const take = page.getByRole("region", { name: "Mira’s take" });
  await expect(take).toContainText(/About \d+ min · [\d.]+ km/);
  await expect(take).toContainText("Estimate");
  await expect(take).not.toContainText("Dark when you set off"); // said once, on the sky card
});

test("saving says what blocks it before the tap; the remembered mode is a default, never over her choice", async ({ browser }) => {
  const { ctx, page } = await newUser(browser, "Zoya");
  // A GPS start can't be saved: the reason and the fix are on screen before she tries.
  await openRoute(page);
  const note = page.getByRole("status").filter({ hasText: "Saving to your account" });
  await expect(note).toContainText("Choose a named starting place to save this plan.");
  await expect(note.getByRole("button", { name: "Choose starting place" })).toBeVisible();

  // Her explicit setting: transit. A new outing starts on it; her own change in this plan wins after reload.
  expect((await page.request.patch("/api/me/prefs", { headers: SAME_ORIGIN, data: { mode: "transit" } })).ok()).toBe(true);
  await page.evaluate(() => sessionStorage.removeItem("mira.plan.v1"));
  await page.goto("/plan?for=go");
  await expect(page.getByRole("radio", { name: "Transit", exact: true })).toHaveAttribute("aria-checked", "true");
  await page.getByRole("radio", { name: "Walk", exact: true }).click();
  await page.reload();
  await expect(page.getByRole("radio", { name: "Walk", exact: true })).toHaveAttribute("aria-checked", "true");
  await page.request.patch("/api/me/prefs", { headers: SAME_ORIGIN, data: { mode: null } });
  await ctx.close();
});

test("after a place's context, correcting it is optional and says what it needs; a place question isn't kept", async ({ browser }) => {
  const { ctx, page } = await newUser(browser, "Leela");
  await page.goto("/around?check=1");
  await page.getByRole("dialog").getByRole("textbox").fill(DEST);
  await page.getByRole("dialog").getByRole("button", { name: new RegExp(DEST) }).first().click();
  await expect(page.getByRole("region", { name: "Mira’s take" })).toContainText(`Around ${DEST}, right now — not your current position.`);
  const correct = page.getByRole("region", { name: "Correct this information" });
  await correct.getByRole("button", { name: "Correct this information" }).click();
  // First-name demo accounts can't prove an email: the requirement is explained, nothing is sent.
  await expect(correct).toContainText("Corrections need a Google or email sign-in");
  await correct.getByRole("button", { name: "Not now" }).click();
  await expect(page.getByRole("region", { name: "Mira’s take" })).toBeVisible();

  // Asking Mira about the place starts a conversation that isn't kept, and the chat says so.
  await page.getByRole("button", { name: "Ask Mira about it" }).click();
  await expect(page).toHaveURL(/\/mira$/);
  await expect(page.getByText("Private conversation: nothing here is saved. Mira remembers it only while this screen is open.")).toBeVisible();
  expect((await (await page.request.get("/api/mira")).json()).messages).toEqual([]);
  await ctx.close();
});

test("a movement question started in Mira stays private with its clarification, until a new conversation", async ({ browser }) => {
  const { ctx, page } = await newUser(browser, "Tara");
  await ctx.clearPermissions(); // no GPS: the turn is private because it's about where she is going
  await page.goto("/mira");
  const bodies: Array<Record<string, unknown>> = [];
  page.on("request", (r) => { if (r.url().endsWith("/api/mira") && r.method() === "POST") bodies.push(r.postDataJSON()); });
  const box = page.getByRole("textbox", { name: "Message Mira" });
  // One message at a time: Send is enabled only when the box has text and no reply is still streaming.
  const ask = async (text: string) => {
    await box.fill(text);
    await expect(page.getByRole("button", { name: "Send" })).toBeEnabled();
    const sent = page.waitForRequest((r) => r.url().endsWith("/api/mira") && r.method() === "POST");
    await box.press("Enter");
    await sent;
    await expect(page.locator("[aria-label='Mira is checking']")).toHaveCount(0);
  };
  await ask("I am going to dinner at Hauz Khas.");
  await expect(page.getByText("Private conversation: nothing here is saved. Mira remembers it only while this screen is open.")).toBeVisible();
  await ask("I mean near Science Faculty.");
  await expect.poll(() => bodies.length).toBe(2);
  expect(bodies[0]).toMatchObject({ ephemeral: true, history: [] });
  expect(bodies[1]).toMatchObject({ ephemeral: true });
  expect((bodies[1].history as Array<{ text: string }>).map((t) => t.text)[0]).toBe("I am going to dinner at Hauz Khas.");
  await expect(page.locator("[aria-label='Mira is checking']")).toHaveCount(0);
  expect((await (await page.request.get("/api/mira")).json()).messages).toEqual([]);

  // An explicit boundary ends it: the private turns leave the screen and the next general question is kept.
  await page.getByRole("button", { name: "New conversation" }).click();
  await expect(page.getByText("I am going to dinner at Hauz Khas.")).toHaveCount(0);
  await ask("How do I add someone to my Circle?");
  await expect.poll(async () => ((await (await page.request.get("/api/mira")).json()).messages as unknown[]).length).toBe(2);
  expect(bodies[2]).not.toHaveProperty("ephemeral");
  await ctx.close();
});
