import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });

test("200% text keeps immediate support controls inside the mobile viewport, with nested keyboard and Back access", async ({ page }) => {
  await page.addInitScript(() => { localStorage.setItem("mira.welcomed", "1"); localStorage.setItem("mira.location.skip", "1"); });
  await page.goto("/plan/legs");
  await page.getByLabel("What do you want to do?").fill("Fictional evening appointment");
  await page.getByLabel("From", { exact: true }).fill("Fictional named terminal");
  await page.getByLabel("To", { exact: true }).fill("Fictional named venue");
  await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
  const documentWidth = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
  expect(documentWidth.scroll).toBeLessThanOrEqual(documentWidth.width);
  for (const step of await page.getByRole("navigation", { name: "Plan steps" }).getByRole("button").all()) {
    const box = await step.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(documentWidth.width + 1);
  }
  // No provider or account lookup may be needed to expose these local actions.
  await page.route("**/api/**", (route) => route.abort("internetdisconnected"));
  const opener = page.getByRole("button", { name: "I feel unsafe", exact: true });
  await opener.click();
  const support = page.getByRole("dialog", { name: "Right now", exact: true });
  await expect(support).toBeVisible();
  const header = support.getByLabel("Immediate support actions");
  const close = header.getByRole("button", { name: "Close", exact: true });
  const emergency = support.getByLabel("Immediate Emergency action").getByRole("button", { name: "Emergency options", exact: true });
  const screen = await page.evaluate(() => ({ width: document.documentElement.clientWidth, height: window.innerHeight }));
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(screen.width + 1);
  for (const control of [close, emergency]) {
    const box = await control.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(screen.width + 1);
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.y + box!.height).toBeLessThanOrEqual(screen.height + 1);
  }
  const box = await support.boundingBox();
  expect(box!.width).toBeLessThanOrEqual(screen.width + 1);
  for (let i = 0; i < 15; i++) {
    expect(await support.evaluate((dialog) => dialog.contains(document.activeElement))).toBe(true);
    await page.keyboard.press("Tab");
  }
  await emergency.click();
  await expect(page.getByRole("dialog", { name: "Emergency call options", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(support).toBeVisible();
  await expect(emergency).toBeFocused();
  await page.goBack();
  await expect(support).toBeHidden();
  await expect(opener).toBeFocused();
});
