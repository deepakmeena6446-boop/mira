import { expect, test } from "@playwright/test";
import { GEO, SAME_ORIGIN, adminPage, apiReport, db, newUser, nextIstMonday, runAggregation } from "./helpers";

const HERE = { lat: GEO.latitude, lon: GEO.longitude };

test.describe("Reports — private until reviewed, public only as thresholded notes", () => {
  test.beforeAll(async () => {
    await db`DELETE FROM aggregate_releases`;
    await db`DELETE FROM aggregate_runs`;
    await db`DELETE FROM reports_private`;
    await db`DELETE FROM abuse_counters`;
  });

  test("3 taps to report; five independent approved reports become one calm note, a lone report stays private", async ({ page, browser }) => {
    // 1. One report through the real UI: tile → (defaults: here, just now) → send.
    const me = await newUser(browser, "Nisha");
    await me.page.goto("/report");
    await me.page.getByRole("button", { name: /Dark or broken street/ }).click();
    await expect(me.page.getByText("Around where you are now")).toBeVisible();
    await me.page.getByRole("button", { name: "Send privately" }).click();
    await expect(me.page.getByText(/Thank you/)).toBeVisible();
    const [first] = await db`SELECT coarse_cell_id, user_id FROM reports_private ORDER BY created_at DESC LIMIT 1`;
    expect(first.coarse_cell_id).toMatch(/^[0-9b-hjkmnp-z]{6}$/); // ~1.2 km geohash cell, never the exact point
    expect(first.user_id).toBeTruthy();

    // 2. Five late-hours reports from separate browsers (independent actors) plus one unrelated report.
    //    (The UI report above is "just now", so it falls in the current time band, not "late".)
    for (let i = 0; i < 5; i++) {
      const ctx = await browser.newContext();
      const res = await apiReport(ctx.request, { involvement: "witnessed", category: "environment", location: HERE, recency: "yesterday", timeBand: "late", narrative: `Dark stretch ${i}` });
      expect(res.status()).toBe(201);
      await ctx.close();
    }
    const lone = await browser.newContext();
    await apiReport(lone.request, { involvement: "experienced", category: "harassment", location: HERE, recency: "today", timeBand: "late", narrative: "SECRET-SINGLE-REPORT man shouted" });
    await lone.close();
    expect((await db`SELECT count(*)::int AS n FROM reports_private`)[0].n).toBe(7);

    // 3. Moderator approves the late environment reports (UI for one, API for the rest).
    const admin = await adminPage(browser);
    const envIds = (await db`SELECT id FROM reports_private WHERE category = 'environment' AND time_band = 'late' ORDER BY id`).map((r) => r.id as string);
    expect(envIds).toHaveLength(5);
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
    const before = await (await page.request.post("/api/geo/nearby", { headers: SAME_ORIGIN, data: HERE })).json();
    expect(before.notes).toEqual([]); // approval alone publishes nothing

    // 4. TEST-ONLY: spread submission days (reports can't be backdated via the app), then the weekly release.
    await db`UPDATE reports_private SET created_at = created_at - (s.rn * interval '1 day'), expires_at = expires_at - (s.rn * interval '1 day')
             FROM (SELECT id AS rid, row_number() OVER (ORDER BY id) AS rn FROM reports_private) s WHERE id = s.rid`;
    const out = runAggregation(nextIstMonday());
    expect(JSON.parse(out.trim().split("\n").pop()!), out).toMatchObject({ ran: true, releasesCreated: 1 });

    // 5. One template-worded note near here — on the API and on the Home sheet. Nothing identifying.
    const json = await (await page.request.post("/api/geo/nearby", { headers: SAME_ORIGIN, data: HERE })).json();
    expect(json.notes).toHaveLength(1);
    expect(json.notes[0].text).toBe("Multiple reviewed observations mention poor lighting in this area during late hours.");
    expect(JSON.stringify(json)).not.toMatch(/Dark stretch|SECRET|harassment|actor|report_id/i);
    await me.page.goto("/");
    await expect(me.page.getByText(/poor lighting in this area/)).toBeVisible();
    await admin.context().close();
    await me.ctx.close();
  });

  test("identifying details are flagged, held, redacted by a moderator and never public", async ({ browser }) => {
    await db`DELETE FROM abuse_counters`;
    const { ctx, page } = await newUser(browser, "Esha");
    await page.goto("/report");
    await page.getByRole("button", { name: /Being followed/ }).click();
    await page.getByRole("button", { name: "It happened to me" }).click();
    await page.getByLabel(/Anything to add/).fill("Auto DL1RT4567 followed me, driver said his name is Rakesh, call 9876543210");
    await expect(page.getByText(/This looks like it includes a/)).toBeVisible();
    await page.getByRole("button", { name: "Send privately" }).click(); // send anyway
    await expect(page.getByText(/Thank you/)).toBeVisible();
    const [row] = await db`SELECT id, status FROM reports_private WHERE category = 'following_stalking' ORDER BY created_at DESC, id DESC LIMIT 1`;
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
    const json = JSON.stringify(await (await page.request.post("/api/geo/nearby", { headers: SAME_ORIGIN, data: HERE })).json());
    expect(json).not.toMatch(/DL1RT4567|Rakesh|9876543210|followed me/);
    await admin.context().close();
    await ctx.close();
  });

  test("malicious text is stored inert; retries save once; forged requests are refused", async ({ browser, request }) => {
    await db`DELETE FROM abuse_counters`;
    const { ctx, page } = await newUser(browser, "Lina");
    const evil = `<img src=x onerror="window.__pwned=1"><script>window.__pwned=2</script>'); DROP TABLE reports_private;--`;
    const before = (await db`SELECT count(*)::int AS n FROM reports_private`)[0].n;
    await page.goto("/report");
    await page.getByRole("button", { name: /Transport problem/ }).click();
    await page.getByLabel(/Anything to add/).fill(evil);
    await page.getByRole("button", { name: "Send privately" }).dblclick();
    await expect(page.getByText(/Thank you/)).toBeVisible();
    expect((await db`SELECT count(*)::int AS n FROM reports_private`)[0].n - before).toBe(1);

    const [row] = await db`SELECT id FROM reports_private WHERE category = 'transport_issue' ORDER BY created_at DESC, id DESC LIMIT 1`;
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

    const body = { idempotencyKey: crypto.randomUUID(), involvement: "witnessed", category: "environment", location: HERE, recency: "today", timeBand: "day" };
    expect((await request.post("/api/reports", { data: body })).status()).toBe(403); // no CSRF header / origin
    expect((await request.post("/api/reports", { headers: { origin: "https://evil.example", "x-mira-request": "1" }, data: body })).status()).toBe(403);
    const bad = await request.post("/api/reports", { headers: SAME_ORIGIN, data: { ...body, category: "<script>" } });
    expect(bad.status()).toBe(400);
    expect(await bad.text()).not.toContain("<script>");
    expect((await request.get("/api/admin/reports")).status()).toBe(401);
    await admin.context().close();
    await ctx.close();
  });
});
