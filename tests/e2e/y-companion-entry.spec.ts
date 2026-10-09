import { expect, test } from "@playwright/test";

// Sprint mira-companion-48h, acceptance A01/A03/A33: a new guest with no storage or permissions sees
// Mira's purpose and a first action before anything else, at the two required phone sizes, and nothing
// asks for location. Simulation: Chromium device emulation against the local e2e stack.
for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }]) {
  test(`a new guest at ${viewport.width}×${viewport.height} sees purpose and a first action without scrolling, and no location request`, async ({ browser }) => {
    const ctx = await browser.newContext({ viewport, permissions: [] });
    const page = await ctx.newPage();
    await page.addInitScript(() => {
      const state = window as unknown as { geoCalls: number };
      state.geoCalls = 0;
      const count = () => { state.geoCalls++; };
      Object.defineProperty(navigator.geolocation, "getCurrentPosition", { configurable: true, value: count });
      Object.defineProperty(navigator.geolocation, "watchPosition", { configurable: true, value: () => { count(); return 0; } });
    });
    await page.goto("/");
    const heading = page.getByRole("heading", { level: 1, name: "Step out with confidence." });
    const input = page.getByRole("textbox", { name: "Where are you heading or what would you like to know?" });
    const outing = page.getByRole("link", { name: "Plan an outing" });
    for (const el of [heading, input, outing]) {
      await expect(el).toBeVisible();
      const box = await el.boundingBox();
      expect(box && box.y + box.height).toBeLessThanOrEqual(viewport.height);
    }
    await expect(input).toHaveAttribute("placeholder", "A run at 5 AM, heading home, a new neighbourhood…");
    // Nothing counted, mapped or requested ahead of her own job.
    await expect(page.getByRole("region", { name: "Right now, around you" })).toHaveCount(0);
    await expect(page.getByText(/Help Points open now/)).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Add what you see here" })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
    // Inputs keep 16 px text so phones don't zoom on focus.
    expect(await input.evaluate((el) => getComputedStyle(el).fontSize)).toBe("16px");

    // Around a place: a named place, no GPS, no route — and it says whose surroundings these are.
    await page.getByRole("link", { name: "Around a place" }).click();
    await expect(page).toHaveURL(/\/around\?check=1$/);
    await page.getByRole("dialog").getByRole("textbox").fill("Vishwavidyalaya");
    await page.getByRole("dialog").getByRole("button", { name: /Vishwavidyalaya/ }).first().click();
    await expect(page.getByText(/^Around Vishwavidyalaya/).first()).toBeVisible();
    expect(await page.evaluate(() => (window as unknown as { geoCalls: number }).geoCalls)).toBe(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
    await ctx.close();
  });
}
