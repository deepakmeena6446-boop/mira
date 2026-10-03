import { expect, test } from "@playwright/test";
import { DEST, newUser } from "./helpers";

test("Home shows Mira live and one-tap contribution; Around briefs a place; legacy Today and map stay usable", async ({ browser }) => {
  const { ctx, page } = await newUser(browser, "Amina");
  await expect(page.getByRole("navigation", { name: "Main" }).getByRole("link")).toHaveText(["Home", "Mira", "Around", "Journeys"]);
  await expect(page.getByRole("heading", { level: 1, name: /, Amina$/ })).toBeVisible();
  await expect(page.getByRole("region", { name: "Right now, around you" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Tell Mira what you’re about to do" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Going somewhere" })).toBeVisible();
  // One tap on Home opens the private report with the category already chosen.
  await page.getByRole("button", { name: "Dark or broken street" }).click();
  await expect(page).toHaveURL(/\/report\?c=environment&from=home$/);
  await expect(page.getByRole("heading", { name: "Dark or broken street" })).toBeVisible();
  // Legacy Today keeps its local pulse and place check.
  await page.goto("/today");
  await expect(page.getByRole("region", { name: "Local pulse" })).toBeVisible();
  await page.getByRole("button", { name: "Check a place" }).click();
  await page.getByPlaceholder("Check a place").fill(DEST);
  await page.getByRole("button", { name: new RegExp(DEST) }).first().click();
  await expect(page).toHaveURL(/\/around$/);
  // Around opens straight into the place's own sky card, then the full map on request.
  await expect(page.getByRole("heading", { name: DEST, exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: `Around ${DEST}, now` })).toBeVisible();
  await page.getByRole("button", { name: "View route & map" }).click();
  await expect(page).toHaveURL(/\/around\/map$/);
  await expect(page.getByText(DEST, { exact: true }).first()).toBeVisible();
  await ctx.close();
});
