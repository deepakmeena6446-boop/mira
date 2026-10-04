import { expect, test, type Page } from "@playwright/test";
import { DEST, SAME_ORIGIN, newUser, savePlaceAt } from "./helpers";

/** Open Mira and wait until the chat has hydrated (it loads history on mount), so taps aren't lost. */
async function openMira(page: Page) {
  const history = page.waitForResponse((r) => new URL(r.url()).pathname === "/api/mira" && r.request().method() === "GET");
  await page.goto("/mira");
  await history;
}

test.describe("Mira — the companion (placeholder engine)", () => {
  test("keeps nearby tools and seeds a saved Home in the shared plan without starting", async ({ browser }) => {
    const { ctx, page } = await newUser(browser, "Kavya");
    await savePlaceAt(page, "Home", DEST);

    await openMira(page);
    // She turned location on once (newUser), so Mira already has it: no "use current location" prompt to tap.
    await expect(page.getByRole("button", { name: "Use current location for nearby questions" })).toBeHidden();
    const box = page.getByPlaceholder("Message Mira…");
    await box.fill("pharmacy near me");
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page.getByRole("log").getByText(/Nearby pharmacies/i)).toBeVisible();

    await box.fill("take me home");
    await page.getByRole("button", { name: "Send" }).click();
    // With location on, Mira proposes the walk home as a card; nothing starts until she taps.
    await expect(page.getByRole("log")).toContainText("To Home");
    await page.getByRole("log").getByRole("button", { name: "Compare ways" }).last().click();
    await page.waitForURL("**/plan?for=go");
    const draft = await page.evaluate(() => JSON.parse(sessionStorage.getItem("mira.plan.v1") ?? "null")?.draft);
    expect(draft.destination.resolution.source).toBe("saved_place");
    expect(draft.destination.query).toBe("Home");
    expect((await (await page.request.get("/api/trips/current")).json()).trip).toBeNull();
    await ctx.close();
  });

  test("points to Emergency when someone says they're in danger, and never claims to be help itself", async ({ browser }) => {
    const { ctx, page } = await newUser(browser, "Sana");
    await openMira(page);
    const processing: string[] = [];
    page.on("request", (request) => { if (request.method() === "POST" && new URL(request.url()).pathname.startsWith("/api/mira")) processing.push(request.url()); });
    await page.getByPlaceholder("Message Mira…").fill("someone is following me, I'm scared");
    await page.getByRole("button", { name: "Send" }).click();
    const support = page.getByRole("dialog", { name: "Right now", exact: true });
    // The country is known (Delhi fix), so Emergency is the one-tap local number, not a chooser (audit P0-1).
    await expect(support.getByLabel("Immediate Emergency action").getByRole("link", { name: /Emergency call, 112/ })).toBeVisible();
    await expect(support.getByRole("button", { name: "Call someone", exact: true })).toBeVisible();
    expect(processing).toEqual([]); // Urgent intent opens local support before chat/model processing.
    await support.getByRole("button", { name: "Close", exact: true }).click();
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
    // Guests can talk to Mira (owner decision 2026-10-04), but nothing is kept and there is no history to read.
    const guest = await anon.request.post("/api/mira", { headers: SAME_ORIGIN, data: { message: "hi", context: { localTime: new Date().toISOString(), tzOffsetMin: 0, location: null } } });
    expect(guest.status()).toBe(200);
    expect(await guest.text()).not.toContain("SECRET-MIRA-LINE");
    expect((await anon.request.get("/api/mira")).status()).toBe(401);

    expect((await a.page.request.delete("/api/mira", { headers: SAME_ORIGIN })).status()).toBe(200);
    expect((await (await a.page.request.get("/api/mira")).json()).messages).toEqual([]);
    await a.ctx.close();
    await b.ctx.close();
    await anon.close();
  });
});
