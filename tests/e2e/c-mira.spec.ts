import { expect, test, type Page } from "@playwright/test";
import { SAME_ORIGIN, newUser, openRoute } from "./helpers";

/** Open Mira and wait until the chat has hydrated (it loads history on mount), so taps aren't lost. */
async function openMira(page: Page) {
  const history = page.waitForResponse((r) => new URL(r.url()).pathname === "/api/mira" && r.request().method() === "GET");
  await page.goto("/mira");
  await history;
}

test.describe("Mira — the companion (placeholder engine)", () => {
  test("knows saved places, finds what's nearby, and starts a trip from chat", async ({ browser }) => {
    const { ctx, page } = await newUser(browser, "Kavya");
    await openRoute(page);
    await page.getByRole("button", { name: "🏠 Home" }).click();
    await expect(page.getByText("Saved as Home")).toBeVisible();

    await openMira(page);
    const box = page.getByPlaceholder("Message Mira…");
    await box.fill("pharmacy near me");
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page.getByRole("log").getByText(/Nearby pharmacies/i)).toBeVisible();

    await box.fill("take me home");
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page.getByRole("log").getByText("To Home")).toBeVisible();
    await page.getByRole("button", { name: /Start my trip|Share my trip/ }).last().click();
    await page.waitForURL("**/trip");
    await expect(page.getByText(/To Home/).first()).toBeVisible();
    await ctx.close();
  });

  test("points to 112 when someone says they're in danger, and never claims to be help itself", async ({ browser }) => {
    const { ctx, page } = await newUser(browser, "Sana");
    await openMira(page);
    await page.getByPlaceholder("Message Mira…").fill("someone is following me, I'm scared");
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page.getByRole("log").getByText(/please call 112/)).toBeVisible();
    await expect(page.getByRole("link", { name: /Call 112/ })).toHaveAttribute("href", "tel:112");
    await page.getByPlaceholder("Message Mira…").fill("who are you");
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page.getByRole("log").getByText(/I'm not an emergency service/)).toBeVisible();
    await ctx.close();
  });

  test("chat history is private to each person and can be cleared", async ({ browser }) => {
    const a = await newUser(browser, "Rhea");
    await openMira(a.page);
    await a.page.getByPlaceholder("Message Mira…").fill("SECRET-MIRA-LINE hello");
    await a.page.getByRole("button", { name: "Send" }).click();
    await expect(a.page.getByRole("log").getByText("SECRET-MIRA-LINE hello")).toBeVisible();

    const b = await newUser(browser, "Tara");
    const hist = await (await b.page.request.get("/api/mira")).json();
    expect(JSON.stringify(hist)).not.toContain("SECRET-MIRA-LINE");
    const anon = await browser.newContext();
    expect((await anon.request.post("/api/mira", { headers: SAME_ORIGIN, data: { message: "hi", context: { localTime: new Date().toISOString(), tzOffsetMin: 0, location: null } } })).status()).toBe(401);

    expect((await a.page.request.delete("/api/mira", { headers: SAME_ORIGIN })).status()).toBe(200);
    expect((await (await a.page.request.get("/api/mira")).json()).messages).toEqual([]);
    await a.ctx.close();
    await b.ctx.close();
    await anon.close();
  });
});
