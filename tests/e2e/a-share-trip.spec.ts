import { expect, test } from "@playwright/test";
import { DEST, acceptContactInvite, addContact, db, newUser, openRoute, shareLinkFor } from "./helpers";

test.describe("Core loop — onboard, save Home, share a trip live, arrive", () => {
  test("a trusted contact follows the trip live and the link goes dark on arrival", async ({ browser }) => {
    const owner = await newUser(browser, "Priya");

    // Save a destination as Home straight from the route sheet.
    await openRoute(owner.page);
    await expect(owner.page.getByText(/min/).first()).toBeVisible();
    await owner.page.getByRole("button", { name: "🏠 Home" }).click();
    await expect(owner.page.getByText("Saved as Home")).toBeVisible();

    // Trusted contact accepts once, from their own browser.
    const address = await addContact(owner.page, "Mum", "mum");
    const mum = await acceptContactInvite(browser, address);
    await owner.page.reload();
    await expect(owner.page.getByText("Trusted", { exact: true })).toBeVisible();

    // Home → "Where are you going?" → one tap on the saved place → context → Start with MIRA.
    await owner.page.goto("/");
    await expect(owner.page.getByRole("heading", { name: "Where are you going?", exact: true })).toBeVisible();
    await expect(owner.page.getByText(/Mum get your live link by email/)).toBeVisible(); // the alert channel, stated
    await expect(owner.page.getByRole("link", { name: /Emergency call, 112/ })).toHaveAttribute("href", "tel:112");
    await owner.page.getByRole("button", { name: /Home/ }).first().click();
    await expect(owner.page.getByRole("region", { name: "Help Points along this route" })).toBeVisible();
    await expect(owner.page.getByRole("radio", { name: /Share with Mum/ })).toHaveAttribute("aria-checked", "true");
    await owner.page.getByRole("button", { name: /Start with MIRA/ }).click();
    await owner.page.waitForURL("**/trip");
    await expect(owner.page.getByText("Sharing live")).toBeVisible();
    await expect(owner.page.getByText(/Mum can see where you are/)).toBeVisible();
    await expect(owner.page.getByRole("link", { name: /Emergency call, 112/ })).toHaveAttribute("href", "tel:112");
    await expect(owner.page.getByRole("button", { name: /Send my live link/ })).toBeEnabled();

    // The contact's live view: first name, destination label, ETA — no account needed.
    const link = await shareLinkFor(address);
    await mum.page.goto(link);
    await expect(mum.page.getByText(/Priya/).first()).toBeVisible();
    await expect(mum.page.getByText(/Expected by/)).toBeVisible();
    await expect(mum.page.locator("body")).not.toContainText(DEST); // label is the saved name, not the address
    const live = await (await mum.page.request.get(`/api/t/${link.split("/t/")[1]}`)).json();
    expect(live).toMatchObject({ state: "active", name: "Priya", destination: "Home" });
    // Only the latest point — no trail, no email, no user id.
    expect(Object.keys(live).sort()).toEqual(["alertsViewer", "dest", "destination", "etaAt", "location", "name", "state"]);
    expect(live.alertsViewer).toBe(true); // she's a trusted contact: she'll get the missed-arrival email
    expect(Object.keys(live.location ?? {}).sort()).toEqual(["ageSeconds", "at", "lat", "lon"]);

    // Arrive: sharing stops for everyone.
    await owner.page.getByRole("button", { name: /I'm here/ }).click();
    await expect(owner.page.getByText(/You made it/)).toBeVisible();
    await mum.page.goto(link);
    await expect(mum.page.getByRole("heading", { name: /Priya arrived/ })).toBeVisible();
    // The viewer → user line: quiet, and no tracking parameters.
    await expect(mum.page.getByText("Want MIRA with you on your journeys?")).toBeVisible();
    await expect(mum.page.getByRole("link", { name: /Get MIRA/ })).toHaveAttribute("href", "/");
    const after = await (await mum.page.request.get(`/api/t/${link.split("/t/")[1]}`)).json();
    expect(after.location).toBeUndefined();

    // Live points are deleted with the trip; after purge the link reveals nothing.
    const [trip] = await db`SELECT id FROM journeys ORDER BY created_at DESC LIMIT 1`;
    expect((await db`SELECT count(*)::int AS n FROM trip_locations WHERE journey_id = ${trip.id}`)[0].n).toBe(0);
    await db`DELETE FROM journeys WHERE id = ${trip.id}`;
    expect((await mum.page.goto(link))?.status()).toBe(404);

    await owner.ctx.close();
    await mum.ctx.close();
  });

  test("works without contacts as a private trip, and can be ended early", async ({ browser }) => {
    const solo = await newUser(browser, "Zoya");
    await openRoute(solo.page);
    await expect(solo.page.getByText(/Nobody is alerted automatically/)).toBeVisible(); // honest before starting
    await solo.page.getByRole("button", { name: /Start with MIRA/ }).click();
    await solo.page.waitForURL("**/trip");
    await expect(solo.page.getByText(/Only people you send your live link to can follow\. Nobody is alerted if you don't arrive/)).toBeVisible();
    await expect(solo.page.getByText(/they'll see your last spot/)).toHaveCount(0);
    await solo.page.getByRole("button", { name: "End trip without arriving" }).click();
    await solo.page.getByRole("button", { name: "End trip", exact: true }).click();
    await expect(solo.page.getByText("Journey ended")).toBeVisible();
    await solo.ctx.close();
  });
});
