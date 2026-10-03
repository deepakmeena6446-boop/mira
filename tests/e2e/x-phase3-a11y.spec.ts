import { expect, test, type Page } from "@playwright/test";
import { newUser } from "./helpers";

// Phase 3 accessibility floor (docs/phase3/00 §4): every screen at the smallest supported phone.
const SCREENS = ["/", "/mira", "/around", "/around/map", "/trips", "/plan?for=go", "/me", "/circle", "/report", "/contribute", "/inbox", "/privacy", "/plan/legs"];

async function audit(page: Page) {
  return page.evaluate(() => {
    const visible = (el: Element) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none"; };
    const name = (el: Element) => (el.getAttribute("aria-label") || el.getAttribute("aria-labelledby") && document.getElementById(el.getAttribute("aria-labelledby")!)?.textContent || (el as HTMLElement).innerText || el.getAttribute("title") || "").trim();
    const controls = [...document.querySelectorAll("button, a[href], [role=button], [role=switch], [role=radio], input:not([type=hidden]), select, textarea")].filter(visible);
    const unnamed = controls.filter((el) => {
      if (el.matches("input, select, textarea")) { const id = el.id; return !(el.getAttribute("aria-label") || (id && document.querySelector(`label[for="${id}"]`)) || el.closest("label") || el.getAttribute("placeholder")); }
      return !name(el);
    }).map((el) => el.outerHTML.slice(0, 120));
    return {
      h1: [...document.querySelectorAll("h1")].map((h) => h.textContent?.trim()),
      unnamed,
      imagesWithoutAlt: [...document.querySelectorAll("img:not([alt])")].length,
      main: document.querySelectorAll("main").length,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
}

test("every screen has one main heading, named controls, described images and no sideways scroll at 320 px", async ({ browser }, info) => {
  test.skip(info.project.name !== "mobile", "one phone-sized browser is enough");
  const { ctx, page } = await newUser(browser, "Anu");
  await page.setViewportSize({ width: 320, height: 700 });
  for (const path of SCREENS) {
    await page.goto(path);
    await page.waitForLoadState("networkidle").catch(() => {});
    const a = await audit(page);
    expect.soft(a.h1, `${path}: exactly one h1`).toHaveLength(1);
    expect.soft(a.unnamed, `${path}: controls without an accessible name`).toEqual([]);
    expect.soft(a.imagesWithoutAlt, `${path}: images without alt`).toBe(0);
    expect.soft(a.main, `${path}: one main landmark`).toBe(1);
    expect.soft(a.overflow, `${path}: no horizontal scroll`).toBeLessThanOrEqual(0);
  }
  await ctx.close();
});
