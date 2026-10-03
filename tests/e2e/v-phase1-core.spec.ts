import { expect, test } from "@playwright/test";
import { DEST, expectNoVerdictWords, newUser } from "./helpers";

// Phase 1 core path (docs/phase1-ux, D39): Home → situation → Mira Brief → consent → live journey → dock → arrival.
test("signed-in person goes from Home's live card to a brief, starts privately, sees the dock and arrives", async ({ browser }) => {
  const { ctx, page } = await newUser(browser, "Noor");

  // 1. Home shows Mira live once location was chosen.
  await page.goto("/");
  const live = page.getByRole("region", { name: "Right now, around you" });
  await expect(live).toContainText("Live around you");
  await expect(live).toContainText(/Dark now|Twilight|Daylight/);
  await expectNoVerdictWords(page);

  // 2. A situation opens the decision flow; places are chosen explicitly.
  await page.getByRole("link", { name: "Going somewhere" }).click();
  await expect(page).toHaveURL(/\/plan\?for=go$/);
  await page.getByRole("region", { name: "Your plan", exact: true }).getByRole("button", { name: /^From/ }).click();
  await page.getByRole("dialog").getByRole("button", { name: /Where I am now/ }).click();
  await page.getByRole("region", { name: "Your plan", exact: true }).getByRole("button", { name: /^To/ }).click();
  await page.getByRole("dialog").getByRole("textbox").fill(DEST);
  await page.getByRole("dialog").getByRole("button", { name: new RegExp(DEST) }).first().click();

  // 3. The brief: the plan's sky card, then a ledger that always ends with what Mira can't see.
  await expect(page.getByRole("heading", { level: 1, name: `To ${DEST}` })).toBeVisible();
  await expect(page.getByRole("region", { name: "Your plan, at that time" })).toBeVisible();
  const ledger = page.getByRole("region", { name: "What Mira checked" });
  await expect(ledger).toContainText("Daylight");
  await expect(ledger).toContainText("Mira can’t see");
  await expectNoVerdictWords(page);

  // 4. Consent: "Just me" is the default and nothing starts before Start.
  await page.getByRole("button", { name: "Go with Mira" }).click();
  const sheet = page.getByRole("dialog", { name: "Go with Mira" });
  await expect(sheet.getByRole("button", { name: "Just me", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(sheet).toContainText("Nobody is contacted.");
  await sheet.getByRole("button", { name: "Start — just me" }).click();

  // 5. Live journey: the glance is the same sky card; "I'm here" is always in reach.
  await expect(page).toHaveURL(/\/trip$/);
  await expect(page.getByRole("region", { name: "Journey status" })).toContainText(/in progress/i);
  await expect(page.getByRole("button", { name: /I'm here/ })).toBeVisible();

  // 6. Elsewhere, the open journey is one tap away.
  await page.goto("/around");
  await page.getByRole("link", { name: /Open your journey/ }).click();
  await expect(page).toHaveURL(/\/trip$/);

  // 7. Arrival closes it calmly.
  await page.getByRole("button", { name: /I'm here/ }).click();
  await expect(page.getByRole("heading", { name: "You made it." })).toBeVisible();
  await ctx.close();
});

test("Mira and Around share the live sky card and Around offers one-tap contribution about a chosen place", async ({ browser }) => {
  const { ctx, page } = await newUser(browser, "Ira");
  // Mira never requests GPS itself; arriving from Home, where she chose location, it shows what it can see.
  await page.goto("/");
  await expect(page.getByRole("region", { name: "Right now, around you" })).toContainText("Live around you");
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Mira" }).click();
  await expect(page.getByRole("region", { name: "What Mira can see right now" })).toBeVisible();
  await page.goto("/around");
  await expect(page.getByRole("region", { name: "Right now, around you" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Add what you see here" })).toBeVisible();
  await page.getByRole("button", { name: /Check a place/ }).first().click();
  await page.getByRole("dialog").getByRole("textbox").fill(DEST);
  await page.getByRole("dialog").getByRole("button", { name: new RegExp(DEST) }).first().click();
  await expect(page.getByRole("heading", { name: "Add what you know about it" })).toBeVisible();
  await page.getByRole("button", { name: "Something good here" }).click();
  await expect(page).toHaveURL(/\/report\?c=positive_condition&from=home$/);
  await expect(page.getByText(new RegExp(`Near ${DEST}`)).first()).toBeVisible();
  await ctx.close();
});
