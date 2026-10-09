import { expect, test } from "@playwright/test";
import { DEST, newUser } from "./helpers";

test("Home leads with purpose and the first action, then Mira live; Around offers one-tap contribution, briefs a place and opens it on the full map", async ({ browser }) => {
  const { ctx, page } = await newUser(browser, "Amina");
  await expect(page.getByRole("navigation", { name: "Main" }).getByRole("link")).toHaveText(["Home", "Mira", "Around", "Journeys"]);
  await expect(page.getByRole("heading", { level: 1, name: "Step out with confidence." })).toBeVisible();
  await expect(page.getByText(/, Amina$/).first()).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Where are you heading or what would you like to know?" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Plan an outing" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Around a place" })).toBeVisible();
  // She chose location, so what's around her follows her own job — never ahead of it, and no contribution ask on Home.
  await expect(page.getByRole("region", { name: "Right now, around you" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Dark or broken street" })).toHaveCount(0);
  // Around: one tap opens the private report with the category already chosen.
  await page.goto("/around");
  await page.getByRole("button", { name: "Dark or broken street" }).click();
  await expect(page).toHaveURL(/\/report\?c=environment&from=around$/);
  await expect(page.getByRole("heading", { name: "Dark or broken street" })).toBeVisible();
  // Around: check a place by name.
  await page.goto("/around");
  await page.getByRole("button", { name: /Check a place/ }).first().click();
  await page.getByRole("dialog").getByRole("textbox").fill(DEST);
  await page.getByRole("dialog").getByRole("button", { name: new RegExp(DEST) }).first().click();
  await expect(page).toHaveURL(/\/around$/);
  // Around opens straight into the place's own sky card, then the full map on request.
  await expect(page.getByRole("heading", { name: DEST, exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: `Around ${DEST}, now` })).toBeVisible();
  await page.getByRole("button", { name: "View route & map" }).click();
  await expect(page).toHaveURL(/\/around\/map$/);
  await expect(page.getByText(DEST, { exact: true }).first()).toBeVisible();
  await ctx.close();
});
