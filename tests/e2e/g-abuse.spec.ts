import { expect, test } from "@playwright/test";
import { adminPage, db, mailText, mailsTo, pickPlace, placeId, uniqueAddress, waitFor, SAME_ORIGIN } from "./helpers";

test.describe("Flow G — malicious input, forged requests, retries, expired tokens", () => {
  test.beforeAll(async () => {
    await db`DELETE FROM abuse_counters`;
  });

  test("malicious narrative is stored and shown inert", async ({ page, browser }) => {
    const evil = `<img src=x onerror="window.__pwned=1"><script>window.__pwned=2</script>'); DROP TABLE reports_private;--`;
    await page.goto("/report");
    await page.getByText("I saw this happen").click();
    await page.getByText("Something else").click();
    await pickPlace(page, /Nearest place/, "Vishwavidyalaya Metro Gate No. 2");
    await page.getByText("Today", { exact: true }).click();
    await page.getByText("Not sure", { exact: true }).click();
    await page.getByLabel(/Anything else/).fill(evil);
    await page.getByRole("button", { name: /Review/ }).click();
    await page.getByRole("button", { name: "Submit privately" }).click();
    await expect(page.getByRole("heading", { name: /private while it is reviewed/ })).toBeVisible();
    const [row] = await db`SELECT id FROM reports_private WHERE category = 'other' ORDER BY created_at DESC, id DESC LIMIT 1`;
    const admin = await adminPage(browser);
    let dialog = false;
    admin.on("dialog", async (d) => {
      dialog = true;
      await d.dismiss();
    });
    await admin.goto(`/admin/reports/${row.id}`);
    await admin.getByRole("button", { name: "Open private text" }).click();
    await expect(admin.getByText(/DROP TABLE reports_private/)).toBeVisible();
    expect(await admin.evaluate(() => (window as unknown as { __pwned?: number }).__pwned)).toBeUndefined();
    expect(dialog).toBe(false);
    expect((await db`SELECT count(*)::int AS n FROM reports_private`)[0].n).toBeGreaterThan(0);
    await admin.context().close();
  });

  test("forged and malformed requests are refused without leaking data", async ({ request }) => {
    const pid = await placeId("Vishwavidyalaya Metro Gate No. 2");
    const body = { idempotencyKey: crypto.randomUUID(), involvement: "witnessed", category: "environment", placeId: pid, recency: "today", timeBand: "day" };
    expect((await request.post("/api/reports", { data: body })).status()).toBe(403); // no CSRF header / origin
    expect((await request.post("/api/reports", { headers: { origin: "https://evil.example", "x-mira-request": "1" }, data: body })).status()).toBe(403);
    const bad = await request.post("/api/reports", { headers: SAME_ORIGIN, data: { ...body, category: "<script>" } });
    expect(bad.status()).toBe(400);
    expect(await bad.text()).not.toContain("<script>");
    expect((await request.get("/api/admin/reports")).status()).toBe(401);
    expect((await request.get(`/api/admin/reports/${crypto.randomUUID()}?text=1`)).status()).toBe(401);
  });

  test("a double-clicked or retried submission is saved once", async ({ page }) => {
    const before = (await db`SELECT count(*)::int AS n FROM reports_private`)[0].n;
    await page.goto("/report");
    await page.getByText("I saw this happen").click();
    await page.getByText("Transport problem").click();
    await pickPlace(page, /Nearest place/, "Vishwavidyalaya Metro Gate No. 2");
    await page.getByText("Today", { exact: true }).click();
    await page.getByText("Day (6 am–6 pm)").click();
    await page.getByRole("button", { name: /Review/ }).click();
    const submit = page.getByRole("button", { name: "Submit privately" });
    await submit.dblclick();
    await expect(page.getByRole("heading", { name: /private while it is reviewed/ })).toBeVisible();
    const after = (await db`SELECT count(*)::int AS n FROM reports_private`)[0].n;
    expect(after - before).toBe(1);
  });

  test("an expired or revoked invitation link reveals nothing", async ({ browser }) => {
    const address = uniqueAddress("expired");
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto("/accompany");
    await page.getByRole("button", { name: "Use my own label instead" }).click();
    await page.getByLabel("Your label").fill("Friend's place");
    await page.getByText("In 15 min").click();
    await page.getByLabel("Their email").fill(address);
    await page.getByRole("button", { name: "Start journey" }).click();
    await expect(page.getByText("Journey active").first()).toBeVisible();
    const [mail] = await waitFor(async () => {
      const m = await mailsTo(address);
      return m.length ? m : null;
    });
    const text = await mailText(mail.ID);
    expect(text).not.toContain("Friend's place"); // private label never emailed
    const link = /http:\/\/localhost:\d+\/invite\/[A-Za-z0-9_-]+/.exec(text)![0];
    await page.getByRole("button", { name: "End journey" }).click();
    await page.getByRole("button", { name: "Yes, end journey" }).click();
    await expect(page.getByRole("heading", { name: "Journey ended." })).toBeVisible();

    const invitee = await (await browser.newContext()).newPage();
    await invitee.goto(link);
    await expect(invitee.getByRole("heading", { name: "Invitation not available" })).toBeVisible();
    await expect(invitee.locator("main")).not.toContainText("Friend");
    await invitee.goto("/invite/forged-token-aaaaaaaaaaaaaaaaaaaaaaaa");
    await expect(invitee.getByRole("heading", { name: "Invitation not available" })).toBeVisible();
    await ctx.close();
  });
});
