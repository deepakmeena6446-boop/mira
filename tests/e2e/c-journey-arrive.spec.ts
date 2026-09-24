import { expect, test } from "@playwright/test";
import { db, pickPlace, waitFor } from "./helpers";

test.describe("Flow C — Accompany: close/reopen, arrive, purge", () => {
  test("journey survives a closed tab, arrival closes it, worker purges it", async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto("/");
    await page.getByRole("link", { name: /Make sure I reach/ }).click();
    await pickPlace(page, /Destination/, "Vishwavidyalaya Metro Gate No. 3");
    await page.getByText("In 30 min").click();
    await expect(page.getByText(/MIRA does not track your route/).first()).toBeVisible();
    await page.getByRole("button", { name: "Start journey" }).click();
    await expect(page.getByText("Journey active").first()).toBeVisible();
    const journeyId = await waitFor(async () => (await db`SELECT id FROM journeys WHERE state = 'active' ORDER BY created_at DESC LIMIT 1`)[0]?.id as string);

    await page.close(); // close the tab
    const reopened = await ctx.newPage();
    await reopened.goto("/");
    await expect(reopened.getByRole("link", { name: /Journey active · check in by/ })).toBeVisible();
    await reopened.goto("/accompany");
    await reopened.getByRole("button", { name: "I arrived" }).click();
    await expect(reopened.getByRole("heading", { name: /You've arrived/ })).toBeVisible();
    await expect(reopened.getByText(/will be deleted by/)).toBeVisible();
    const [row] = await db`SELECT state, closed_at, purge_at FROM journeys WHERE id = ${journeyId}`;
    expect(row.state).toBe("arrived");
    expect(new Date(row.purge_at).getTime() - new Date(row.closed_at).getTime()).toBeLessThanOrEqual(24 * 3600_000);

    // Advance to the deletion deadline; the real worker hard-deletes the row.
    await db`UPDATE journeys SET purge_at = now() WHERE id = ${journeyId}`;
    await waitFor(async () => (await db`SELECT count(*)::int AS n FROM journeys WHERE id = ${journeyId}`)[0].n === 0);
    await reopened.goto("/accompany");
    await expect(reopened.getByRole("button", { name: "Start journey" })).toBeVisible();
    await ctx.close();
  });
});
