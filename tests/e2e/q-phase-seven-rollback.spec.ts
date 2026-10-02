import { expect, test } from "@playwright/test";

test("entry switch restores the previous Today hierarchy", async ({ page }) => {
  test.skip(process.env.NEXT_PUBLIC_MIRA_GO_ENTRY !== "legacy", "Run against a legacy-flag production build.");
  await page.addInitScript(() => localStorage.setItem("mira.welcomed", "1"));
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Today", exact: true })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Main" }).getByRole("link")).toHaveText(["Today", "Around", "Mira", "Contribute", "You"]);
  await expect(page.getByRole("button", { name: "Emergency options" }).first()).toBeVisible();
});
