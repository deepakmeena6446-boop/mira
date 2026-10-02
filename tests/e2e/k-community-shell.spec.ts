import { expect, test } from "@playwright/test";
import { DEST, newUser } from "./helpers";

test("Go leads to a decision while legacy Today, Around and map links remain usable", async ({ browser }) => {
  const { ctx, page } = await newUser(browser, "Amina");
  await expect(page.getByRole("navigation", { name: "Main" }).getByRole("link")).toHaveText(["Go", "Journeys", "You"]);
  await expect(page.getByRole("heading", { name: /Go, Amina/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Plan a movement/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Ask Mira/ })).toBeVisible();
  await page.goto("/today");
  await expect(page.getByRole("region", { name: "Local pulse" })).toBeVisible();
  await page.getByRole("button", { name: "Check a place" }).click();
  await page.getByPlaceholder("Check a place").fill(DEST);
  await page.getByRole("button", { name: new RegExp(DEST) }).first().click();
  await expect(page).toHaveURL(/\/around$/);
  await expect(page.getByRole("heading", { name: DEST })).toBeVisible();
  await expect(page.getByText(/min walk|Approximate|couldn.t check/i).first()).toBeVisible();
  await page.getByRole("button", { name: "View route & map" }).click();
  await expect(page).toHaveURL(/\/around\/map$/);
  await expect(page.getByText(DEST, { exact: true }).first()).toBeVisible();
  await ctx.close();
});
