import { expect, test } from "@playwright/test";
import { adminPage, apiReport, db, nextIstMonday, pickPlace, placeId, runAggregation } from "./helpers";

const PLACE = "Vishwavidyalaya Metro Gate No. 2";

test.describe("Flow B — REPORT → review → weekly release → KNOW", () => {
  test.beforeAll(async () => {
    await db`DELETE FROM aggregate_releases`;
    await db`DELETE FROM aggregate_runs`;
    await db`DELETE FROM reports_private`;
    await db`DELETE FROM abuse_counters`;
  });

  test("five independent approved reports become one coarse summary; a single report stays private", async ({ page, browser }) => {
    // 1. One report through the real UI.
    await page.goto("/");
    await page.getByRole("link", { name: /Share an observation/ }).click();
    await page.getByText("I saw this happen").click();
    await page.getByText("Street environment").click();
    await pickPlace(page, /Nearest place/, PLACE);
    await page.getByText("Today", { exact: true }).click();
    await page.getByText("Late (10 pm–6 am)").click();
    await page.getByLabel(/Anything else/).fill("Streetlights near the gate were not working");
    await page.getByRole("button", { name: /Review/ }).click();
    await expect(page.getByText("Only reviewed, combined observations may appear in Know.")).toBeVisible();
    await page.getByRole("button", { name: "Submit privately" }).click();
    await expect(page.getByRole("heading", { name: /Your observation is private while it is reviewed/ })).toBeVisible();

    // 2. Four more from separate browsers (independent actors), plus one unrelated report.
    const pid = await placeId(PLACE);
    for (let i = 0; i < 4; i++) {
      const ctx = await browser.newContext();
      const res = await apiReport(ctx.request, { involvement: "witnessed", category: "environment", placeId: pid, recency: "yesterday", timeBand: "late", narrative: `Dark stretch ${i}` });
      expect(res.status()).toBe(201);
      await ctx.close();
    }
    const lone = await browser.newContext();
    await apiReport(lone.request, { involvement: "experienced", category: "harassment", placeId: pid, recency: "today", timeBand: "late", narrative: "SECRET-SINGLE-REPORT man shouted" });
    await lone.close();
    const [{ n }] = await db`SELECT count(*)::int AS n FROM reports_private`;
    expect(n).toBe(6);

    // 3. Moderator review: approve the five environment reports (UI for one, API for the rest).
    const admin = await adminPage(browser);
    await expect(admin.getByText("Approval permits aggregation only; it never publishes this report.")).toBeVisible();
    const envIds = (await db`SELECT id FROM reports_private WHERE category = 'environment' ORDER BY id`).map((r) => r.id as string);
    await admin.goto(`/admin/reports/${envIds[0]}`);
    await admin.getByLabel(/poor lighting/).check();
    await admin.getByRole("button", { name: "Approve for aggregation" }).click();
    await admin.getByRole("button", { name: "Confirm approve" }).click();
    await expect(admin.getByText(/Done — report is now approved/)).toBeVisible();
    for (const id of envIds.slice(1)) {
      const r = await admin.request.patch(`/api/admin/reports/${id}`, {
        headers: { origin: new URL(admin.url()).origin, "x-mira-request": "1" },
        data: { action: "approve", structured: { category: "environment", tags: ["poor_lighting"], timeBand: "late" } },
      });
      expect(r.status()).toBe(200);
    }
    // A single approval changes nothing public before the weekly release.
    const before = await (await page.request.post("/api/know", { data: { mode: "place", placeId: pid, time: "late" } })).json();
    expect(before.community.coverage).toBe("no_recent_community_data");

    // 4. TEST-ONLY: spread submission times over past days (reports can't be backdated via the app).
    await db`UPDATE reports_private SET created_at = created_at - (s.rn * interval '1 day'), expires_at = expires_at - (s.rn * interval '1 day')
             FROM (SELECT id AS rid, row_number() OVER (ORDER BY id) AS rn FROM reports_private) s WHERE id = s.rid`;

    // 5. Weekly release (operator CLI, idempotent per IST Monday).
    const out = runAggregation(nextIstMonday());
    expect(JSON.parse(out.trim().split("\n").pop()!)).toMatchObject({ ran: true, releasesCreated: 1 });

    // 6. KNOW shows one coarse, template-worded summary; nothing identifying.
    await page.goto(`/know/place/${pid}`);
    await page.getByRole("radio", { name: "Late" }).check({ force: true });
    await expect(page.getByText("Multiple independent recent observations")).toBeVisible();
    await expect(page.getByText("Multiple reviewed observations mention poor lighting in this area during late hours.")).toBeVisible();
    const main = await page.locator("main").innerText();
    expect(main).not.toMatch(/Streetlights near the gate|Dark stretch|SECRET-SINGLE-REPORT|harassment/i);
    const json = JSON.stringify(await (await page.request.post("/api/know", { data: { mode: "place", placeId: pid, time: "late" } })).json());
    expect(json).not.toMatch(/Dark stretch|SECRET|actor|\b5\b reports|report_id/i);
    await admin.context().close();
  });
});
