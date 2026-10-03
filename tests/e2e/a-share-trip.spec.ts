import { expect, test } from "@playwright/test";
import { DEST, acceptContactInvite, addContact, db, mailsTo, newUser, openRoute, shareLinkFor, waitFor, openJourneyMore } from "./helpers";

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
    // Phase 1 roots (D39): Home, Mira, Around and Journeys; legacy routes remain reachable in context.
    await expect(owner.page.getByRole("navigation", { name: "Main" }).getByRole("link")).toHaveText(["Home", "Mira", "Around", "Journeys"]);

    // Around → map → one tap on the saved place → context → Start with Mira.
    await owner.page.goto("/around/map/classic");
    await expect(owner.page.getByRole("heading", { name: "Where are you going?", exact: true })).toBeVisible();
    await expect(owner.page.getByRole("link", { name: /Emergency call, 112/ })).toHaveAttribute("href", "tel:112");
    await owner.page.getByRole("button", { name: /Home/ }).first().click();
    await expect(owner.page.getByRole("region", { name: "Help Points along this route" })).toBeVisible();
    const starts: Array<{ recipientIds: string[]; share: boolean }> = [];
    owner.page.on("request", (request) => {
      if (new URL(request.url()).pathname === "/api/trips" && request.method() === "POST") starts.push(request.postDataJSON());
    });
    await expect(owner.page.getByRole("checkbox", { name: /Mum/ })).not.toBeChecked();
    await owner.page.getByRole("checkbox", { name: /Mum/ }).check();
    await expect(owner.page.getByRole("checkbox", { name: /Mum/ })).toBeChecked();
    expect(starts).toHaveLength(0); // Recipient selection alone never starts or alerts.
    await expect(owner.page.getByText(/Mira attempts to email Mum a live link when this journey starts/)).toBeVisible();
    await owner.page.getByRole("button", { name: /Go with Mira/ }).click();
    await owner.page.waitForURL("**/trip");
    expect(starts).toHaveLength(1);
    expect(starts[0]).toMatchObject({ share: true, recipientIds: [expect.any(String)] });
    const started = (await (await owner.page.request.get("/api/trips/current")).json()).trip;
    expect(started.sharedWith).toEqual([expect.objectContaining({ id: starts[0].recipientIds[0], name: "Mum", linkDelivery: "sent" })]);
    await expect(owner.page.getByText("Sharing enabled")).toBeVisible();
    await expect(owner.page.getByText("The email provider accepted a journey link for Mum. Receipt and viewing are unknown.")).toBeVisible();
    await expect(owner.page.getByRole("link", { name: /Emergency call, 112/ })).toHaveAttribute("href", "tel:112");
    await expect(owner.page.getByRole("button", { name: /Send my live link/ })).toBeEnabled();

    // Local Mailpit accepts the selected recipient's request; real delivery/receipt remains unknown.
    await owner.page.getByRole("button", { name: "I feel unsafe" }).click();
    await owner.page.getByRole("dialog", { name: "Right now" }).getByRole("button", { name: /Tell my people now/ }).click();
    await expect(owner.page.getByRole("dialog", { name: "Right now" }).getByText(/Email accepted for Mum; receipt is unknown/)).toBeVisible();
    await waitFor(async () => (await mailsTo(address)).find((m) => m.Subject.includes("asked you to check on them")));
    await owner.page.getByRole("button", { name: "I'm okay now" }).click();

    // The contact's live view: first name, destination label, ETA — no account needed.
    const link = await shareLinkFor(address);
    await mum.page.goto(link);
    await expect(mum.page.getByText(/Priya/).first()).toBeVisible();
    await expect(mum.page.getByText(/Expected by/)).toBeVisible();
    await expect(mum.page.getByText(/Priya asked you to check on them/)).toBeVisible();
    await expect(mum.page.locator("body")).not.toContainText(DEST); // label is the saved name, not the address
    const live = await (await mum.page.request.get(`/api/t/${link.split("/t/")[1]}`)).json();
    expect(live).toMatchObject({ state: "active", name: "Priya", destination: "Home" });
    // Only the latest point — no trail, no email, no user id.
    expect(Object.keys(live).sort()).toEqual(["alertsViewer", "checkRequested", "dest", "destination", "etaAt", "location", "mode", "name", "state", "tz"]); // tz: her local time zone label for the ETA
    expect(live.alertsViewer).toBe(true); // This selected accepted contact is eligible for an email attempt.
    expect(Object.keys(live.location ?? {}).sort()).toEqual(["ageSeconds", "at", "lat", "lon"]);

    // Arrive: sharing stops for everyone.
    await owner.page.getByRole("button", { name: /I'm here/ }).click();
    await expect(owner.page.getByText(/You made it/)).toBeVisible();
    await mum.page.goto(link);
    await expect(mum.page.getByRole("heading", { name: /Priya arrived/ })).toBeVisible();
    // The viewer → user line: quiet, and no tracking parameters.
    await expect(mum.page.getByText("Want Mira with you on your journeys?")).toBeVisible();
    await expect(mum.page.getByRole("link", { name: /Try Mira/ })).toHaveAttribute("href", "/");
    const after = await (await mum.page.request.get(`/api/t/${link.split("/t/")[1]}`)).json();
    expect(after.location).toBeUndefined();

    // Live points are deleted with the trip; after purge the link reveals nothing.
    const trip = { id: started.id };
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
    await solo.page.getByRole("button", { name: /Go with Mira/ }).click();
    await solo.page.waitForURL("**/trip");
    expect((await (await solo.page.request.get("/api/trips/current")).json()).trip.sharedWith).toEqual([]);
    await expect(solo.page.getByText(/Only people you send your live link to can follow\. Nobody is alerted automatically/)).toBeVisible();
    await expect(solo.page.getByText(/they'll see your last spot/)).toHaveCount(0);
    await openJourneyMore(solo.page);
    await solo.page.getByRole("button", { name: "End trip without arriving" }).click();
    await solo.page.getByRole("button", { name: "End trip", exact: true }).click();
    await expect(solo.page.getByText("Journey ended")).toBeVisible();
    await solo.ctx.close();
  });
});
