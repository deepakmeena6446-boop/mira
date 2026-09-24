import { expect, test } from "@playwright/test";
import { adminPage, db, pickPlace, placeId } from "./helpers";

test.describe("Flow E — identifying content is held, redacted and never public", () => {
  test("PII report → hold → redact → approve → no identifying text in public JSON/UI; no AI request", async ({ page, browser }) => {
    await db`DELETE FROM abuse_counters`;
    const suggestCalls: string[] = [];
    page.on("request", (r) => r.url().includes("/api/reports/suggest") && suggestCalls.push(r.url()));
    await page.goto("/report");
    await page.getByText("I experienced this").click();
    await page.getByText("Being followed").click();
    await pickPlace(page, /Nearest place/, "Vishwavidyalaya Metro Gate No. 1");
    await page.getByText("Yesterday").click();
    await page.getByText("Evening (6–10 pm)").click();
    await page.getByLabel(/Anything else/).fill("Auto DL1RT4567 followed me, driver said his name is Rakesh, call 9876543210");
    await page.getByRole("button", { name: /Review/ }).click();
    await expect(page.getByText("This may identify someone")).toBeVisible();
    await expect(page.locator("mark")).toHaveCount(3);
    await expect(page.getByText(/Optional: suggest a category/)).toHaveCount(0); // AI not configured → no control
    await page.getByRole("button", { name: "Submit privately" }).click(); // sends anyway
    await expect(page.getByRole("heading", { name: /private while it is reviewed/ })).toBeVisible();
    expect(suggestCalls).toHaveLength(0);

    const [row] = await db`SELECT id, status, hold_reasons FROM reports_private WHERE category = 'following_stalking' ORDER BY created_at DESC, id DESC LIMIT 1`;
    expect(row.status).toBe("held");

    const admin = await adminPage(browser);
    await admin.goto("/admin/reports?status=held");
    await expect(admin.locator("body")).not.toContainText("DL1RT4567");
    await admin.goto(`/admin/reports/${row.id}`);
    await expect(admin.getByRole("button", { name: "Approve for aggregation" })).toBeDisabled();
    await admin.getByRole("button", { name: "Open private text" }).click();
    await expect(admin.getByText(/DL1RT4567/)).toBeVisible();
    await admin.getByRole("button", { name: "Redact detected spans" }).click();
    await expect(admin.getByText(/Done — report is now held/)).toBeVisible();
    await admin.getByRole("button", { name: "Open private text" }).click();
    await expect(admin.getByText(/Auto \[removed\] followed me/)).toBeVisible();
    await expect(admin.locator("main")).not.toContainText("9876543210");
    await admin.getByRole("button", { name: "Approve for aggregation" }).click();
    await admin.getByRole("button", { name: "Confirm approve" }).click();
    await expect(admin.getByText(/Done — report is now approved/)).toBeVisible();

    const pid = await placeId("Vishwavidyalaya Metro Gate No. 1");
    const json = JSON.stringify(await (await page.request.post("/api/know", { data: { mode: "place", placeId: pid, time: "evening" } })).json());
    expect(json).not.toMatch(/DL1RT4567|Rakesh|9876543210|removed|followed me/);
    await page.goto(`/know/place/${pid}`);
    await expect(page.locator("main")).not.toContainText("Rakesh");
    await admin.context().close();
  });
});
