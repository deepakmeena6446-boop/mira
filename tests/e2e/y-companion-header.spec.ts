import { expect, test } from "@playwright/test";

// design/mira-companion-ux: on ordinary task screens the Support pair is quieter (one hairline group), but stays
// labelled, in the same place, in the first screen, and a full 44 px target — at the smallest supported width.
const ROOTS = ["/", "/mira", "/around", "/trips", "/plan?for=go", "/me"];

test.use({ viewport: { width: 320, height: 568 } });

for (const path of ROOTS) {
  test(`${path}: I feel unsafe and Emergency are labelled, in view and 44 px at 320 px`, async ({ page }) => {
    await page.goto(path);
    const support = page.getByRole("group", { name: "Support" });
    await expect(support).toHaveCount(1);
    const unsafe = support.getByRole("button", { name: "I feel unsafe" });
    const emergency = support.getByRole("link", { name: /^Emergency call, \d+/ }).or(support.getByRole("button", { name: /Emergency/ }));
    for (const target of [unsafe, emergency]) {
      await expect(target).toBeVisible();
      await expect(target).toHaveText(/\S/); // a visible word, not an icon alone
      const box = (await target.boundingBox())!;
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(320);
      expect(box.y + box.height).toBeLessThanOrEqual(568);
    }
    // One tap opens the support sheet.
    await unsafe.click();
    await expect(page.getByRole("dialog", { name: "Right now" })).toBeVisible();
  });
}
