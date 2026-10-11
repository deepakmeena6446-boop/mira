import { expect, test, type Locator, type Page } from "@playwright/test";
import { DEST } from "./helpers";

// Audit F4/F5: at 200 % text the controls that finish a task stay on screen and take a tap. Overflow alone isn't
// enough — the brief's action bar clipped its Save while the page reported no sideways scroll — so each control is
// checked to sit inside the viewport and to be what a tap at its centre reaches.
test.use({ viewport: { width: 390, height: 844 }, permissions: [] });

const BIG = "html { font-size: 200% !important; }";

async function expectTappable(page: Page, control: Locator, label: string) {
  await expect(control, label).toBeVisible();
  const box = (await control.boundingBox())!;
  const vp = page.viewportSize()!;
  expect(box.x, `${label} left edge`).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width, `${label} right edge`).toBeLessThanOrEqual(vp.width);
  expect(box.y + box.height, `${label} bottom edge`).toBeLessThanOrEqual(vp.height);
  expect(box.height, `${label} height`).toBeGreaterThanOrEqual(44);
  const hit = await control.evaluate((el) => { const r = el.getBoundingClientRect(); const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return Boolean(top && (top === el || el.contains(top))); });
  expect(hit, `${label} receives a tap at its centre`).toBe(true);
}

async function pick(page: Page, field: RegExp, query: string) {
  await page.getByRole("region", { name: "Your plan", exact: true }).getByRole("button", { name: field }).click();
  await page.getByRole("dialog").getByRole("textbox").fill(query);
  await page.getByRole("dialog").getByRole("button", { name: new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") }).first().click();
}

test("200% text: the brief's two actions stay on screen and tappable", async ({ page }) => {
  await page.goto("/plan?for=go");
  await pick(page, /^From/, "Hindu College");
  await pick(page, /^To/, DEST);
  await expect(page.getByRole("region", { name: "Your plan, at that time" })).toBeVisible();
  // Normal size: both on one row.
  const primary = page.getByRole("button", { name: /^(Go with Mira|Save this plan|Sign in to save|Can’t save yet)$/ }).first();
  const secondary = page.getByRole("button", { name: /^(Save this plan|Can’t save yet|Go with Mira|Go now)$/ }).last();
  const [p1, s1] = [(await primary.boundingBox())!, (await secondary.boundingBox())!];
  expect(Math.abs(p1.y - s1.y)).toBeLessThan(8);
  await page.addStyleTag({ content: BIG });
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  await expectTappable(page, primary, "primary action");
  await expectTappable(page, secondary, "secondary action");
});

test("200% text: the chat's Send button stays on screen and tappable", async ({ page }) => {
  await page.goto("/mira");
  await page.addStyleTag({ content: BIG });
  const box = page.getByRole("textbox", { name: "Message Mira" });
  await box.fill("What can you help me with?");
  await expectTappable(page, page.getByRole("button", { name: "Send" }), "Send");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.locator("[aria-label='Mira is checking']")).toHaveCount(0);
  await expect(page.getByText("What can you help me with?")).toBeVisible();
});

// Every screen with the quiet Support pair: at 200 % neither action is clipped by its capsule or the screen.
for (const path of ["/", "/mira", "/around", "/trips", "/plan?for=go", "/me", "/inbox", "/circle", "/contribute", "/report", "/around/map", "/plan/legs"]) {
  test(`200% text: ${path} shows I feel unsafe and Emergency whole`, async ({ page }) => {
    await page.goto(path);
    const support = page.getByRole("group", { name: "Support" });
    if (!(await support.count())) test.skip(true, `${path} has no Support group for a guest`);
    await page.addStyleTag({ content: BIG });
    await page.waitForTimeout(300);
    const group = (await support.boundingBox())!;
    for (const control of [support.getByRole("button", { name: "I feel unsafe" }), support.getByRole("link", { name: /^Emergency call/ }).or(support.getByRole("button", { name: /Emergency/ }))]) {
      await expectTappable(page, control, `${path} support control`);
      const box = (await control.boundingBox())!;
      expect(box.x + box.width, `${path}: control inside its capsule`).toBeLessThanOrEqual(group.x + group.width + 1);
      expect(await control.evaluate((el) => el.scrollWidth <= el.clientWidth + 1), `${path}: label not clipped`).toBe(true);
    }
  });
}

test("200% text: the chat's plan strip keeps the plan's name readable", async ({ page }) => {
  await page.goto("/plan?for=go");
  await pick(page, /^From/, "Hindu College");
  await pick(page, /^To/, DEST);
  await expect(page.getByRole("region", { name: "Your plan, at that time" })).toBeVisible();
  await page.goto("/mira");
  await page.addStyleTag({ content: BIG });
  const line = page.getByText(/^Your movement plan/);
  await expect(line).toBeVisible();
  expect((await line.boundingBox())!.width, "the plan's name gets a usable width").toBeGreaterThan(200);
  // The top area scrolls at this size, so Open can be brought into reach and isn't under the message dock.
  await page.getByRole("link", { name: "Open" }).scrollIntoViewIfNeeded();
  await expectTappable(page, page.getByRole("link", { name: "Open" }), "Open plan");
});
