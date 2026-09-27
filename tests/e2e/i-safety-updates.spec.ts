import { expect, test } from "@playwright/test";
import { newUser } from "./helpers";

/**
 * Women Safety Intelligence on Home (SAFETY_UPDATES=fixture: "[Sample]" data, no live index).
 * A count and a sheet, never a feed or a rating; one story reported twice is one update;
 * official sources are marked apart from news; every update links to its source.
 */
test("Home shows a restrained safety-updates line; the sheet keeps sources, ages and allegation status", async ({ browser }, info) => {
  const { ctx, page } = await newUser(browser, "Meera");
  const section = page.getByRole("region", { name: "Safety updates" });
  await expect(section).toContainText("Delhi");
  await expect(section).toContainText("2 recent women-safety updates from the past 7 days");
  await expect(section).toContainText("Community reports: not in the beta");
  await section.getByRole("button", { name: "View updates" }).click();

  const sheet = page.getByRole("dialog", { name: /Safety updates · Delhi/ });
  await expect(sheet).toContainText("not a rating of the area");
  await expect(sheet.getByText("Official source", { exact: true })).toBeVisible();
  await expect(sheet.getByText("News report", { exact: true })).toBeVisible();
  await expect(sheet).toContainText("Arrest reported, not a conviction");
  await expect(sheet).toContainText("(city-level)");
  await expect(sheet).not.toContainText("women's team wins"); // the sport result is filtered out
  await expect(sheet.getByRole("link", { name: "Read source" })).toHaveCount(2);
  await sheet.getByText("Reported by 2 sources").click();
  await expect(sheet).toContainText("One story reported by several outlets, not separate incidents.");
  // No verdict words in what the feature says (Home itself has the "I feel unsafe" button).
  expect(await sheet.innerText()).not.toMatch(/\b(safe|safer|safest|unsafe|dangerous)\b/i);
  expect(await section.innerText()).not.toMatch(/\b(safe|safer|safest|unsafe|dangerous)\b/i);
  if (info.project.name === "mobile") expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);

  await sheet.getByRole("button", { name: "Past 30 days" }).click();
  await expect(sheet.getByRole("button", { name: "Past 30 days" })).toHaveAttribute("aria-pressed", "true");
  await sheet.getByRole("button", { name: "Close", exact: true }).click();
  await expect(sheet).toBeHidden();
  await ctx.close();
});
