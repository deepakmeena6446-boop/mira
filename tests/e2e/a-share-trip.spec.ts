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

    // Home → one tap on the saved place → Share my trip.
    await owner.page.goto("/");
    await owner.page.getByRole("button", { name: /Home/ }).first().click();
    await owner.page.getByRole("button", { name: /Share my trip/ }).click();
    await owner.page.waitForURL("**/trip");
    await expect(owner.page.getByText("Sharing live")).toBeVisible();
    await expect(owner.page.getByText(/Mum can see where you are/)).toBeVisible();

    // The contact's live view: first name, destination label, ETA — no account needed.
    const link = await shareLinkFor(address);
    await mum.page.goto(link);
    await expect(mum.page.getByText(/Priya/).first()).toBeVisible();
    await expect(mum.page.getByText(/Expected by/)).toBeVisible();
    await expect(mum.page.locator("body")).not.toContainText(DEST); // label is the saved name, not the address
    const live = await (await mum.page.request.get(`/api/t/${link.split("/t/")[1]}`)).json();
    expect(live).toMatchObject({ state: "active", name: "Priya", destination: "Home" });
    // Only the latest point — no trail, no email, no user id.
    expect(Object.keys(live).sort()).toEqual(["dest", "destination", "etaAt", "location", "name", "state"]);
    expect(Object.keys(live.location ?? {}).sort()).toEqual(["ageSeconds", "at", "lat", "lon"]);

    // Arrive: sharing stops for everyone.
    await owner.page.getByRole("button", { name: /I'm here/ }).click();
    await expect(owner.page.getByText(/You made it/)).toBeVisible();
    await mum.page.goto(link);
    await expect(mum.page.getByRole("heading", { name: /Priya arrived/ })).toBeVisible();
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
    await solo.page.getByRole("button", { name: /Start my trip/ }).click();
    await solo.page.waitForURL("**/trip");
    await expect(solo.page.getByText("This trip is private.", { exact: false })).toBeVisible();
    await solo.page.getByRole("button", { name: "End trip without arriving" }).click();
    await solo.page.getByRole("button", { name: "End trip", exact: true }).click();
    await expect(solo.page.getByText("Trip ended")).toBeVisible();
    await solo.ctx.close();
  });
});
