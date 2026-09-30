import { expect, test } from "@playwright/test";
import { DEST, newUser } from "./helpers";

test("Today explains Mira, Around gives a place brief, and the map opens on request", async ({ browser }) => {
  const { ctx, page } = await newUser(browser, "Amina");
  await expect(page.getByRole("navigation", { name: "Main" }).getByRole("link")).toHaveText(["Today", "Around", "Mira", "Contribute", "You"]);
  await expect(page.getByText("Know a place. Go with support. Help the next person.")).toBeVisible();
  await expect(page.getByRole("link", { name: /Ask Mira/ })).toBeVisible();
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
