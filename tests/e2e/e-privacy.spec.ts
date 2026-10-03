import { expect, test } from "@playwright/test";
import { DEST, SAME_ORIGIN, acceptContactInvite, addContact, db, newUser, openRoute, savePlaceAt, shareLinkFor, startJourney, openJourneyMore } from "./helpers";

test.describe("Privacy — links die, strangers see nothing, deletion is real", () => {
  test("an ended trip's link and forged links reveal nothing; another user can't act on the trip", async ({ browser }) => {
    test.setTimeout(360_000); // three people onboard in one flow
    const owner = await newUser(browser, "Aditi");
    const address = await addContact(owner.page, "Bhai", "bhai");
    const contact = await acceptContactInvite(browser, address);
    await openRoute(owner.page);
    await startJourney(owner.page, ["Bhai"]);
    const link = await shareLinkFor(address);
    const { trip } = await (await owner.page.request.get("/api/trips/current")).json();
    expect(trip.sharedWith).toEqual([expect.objectContaining({ name: "Bhai", linkDelivery: "sent" })]);

    const stranger = await newUser(browser, "Stranger");
    for (const [action, data] of [
      ["end", {}], ["arrive", {}], ["extend", { minutes: 10 }], ["checkon", {}],
      ["share", { recipientIds: [trip.sharedWith[0].id] }], ["revoke", { contactId: trip.sharedWith[0].id }],
      ["link", {}], ["change", { to: { lat: 28.7, lon: 77.2, name: "Fictional change" }, etaMinutes: 20 }],
    ] as const) {
      const res = await stranger.page.request.post(`/api/trips/${trip.id}/${action}`, { headers: SAME_ORIGIN, data });
      expect(res.status(), action).toBe(404);
    }
    const loc = await stranger.page.request.post(`/api/trips/${trip.id}/location`, { headers: SAME_ORIGIN, data: { lat: 28.7, lon: 77.2 } });
    expect(loc.status(), await loc.text()).toBe(404);

    await openJourneyMore(owner.page);

    await owner.page.getByRole("button", { name: "End trip without arriving" }).click();
    await owner.page.getByRole("button", { name: "End trip", exact: true }).click();
    await expect(owner.page.getByText("Journey ended")).toBeVisible();
    await contact.page.goto(link);
    await expect(contact.page.getByRole("heading", { name: /trip has ended/ })).toBeVisible();
    const ended = await (await contact.page.request.get(`/api/t/${link.split("/t/")[1]}`)).json();
    expect(ended).toEqual({ state: "ended", name: "Aditi" }); // no destination once it's over
    expect((await contact.page.goto("/t/forged-token-aaaaaaaaaaaaaaaaaaaa"))?.status()).toBe(404);
    await contact.page.goto("/invite/forged-token-aaaaaaaaaaaaaaaaaaaaaaaa");
    await expect(contact.page.getByRole("heading", { name: "Invitation not available" })).toBeVisible();

    await owner.ctx.close();
    await contact.ctx.close();
    await stranger.ctx.close();
  });

  test("personal APIs need a session, and deleting the account erases places, contacts and trips", async ({ browser }) => {
    const anon = await browser.newContext();
    for (const path of ["/api/me/places", "/api/me/contacts", "/api/mira"]) {
      expect((await anon.request.get(path)).status(), path).toBe(401);
    }
    expect(await (await anon.request.get("/api/trips/current")).json()).toEqual({ trip: null });
    expect((await (await anon.request.get("/api/me")).json()).user).toBeNull();

    const { ctx, page } = await newUser(browser, "Gone");
    await savePlaceAt(page, "Home", DEST);
    await addContact(page, "Friend", "friend");
    const [{ id: userId }] = await db`SELECT id FROM users WHERE name = 'Gone' ORDER BY created_at DESC LIMIT 1`;
    expect((await page.request.delete("/api/me", { headers: SAME_ORIGIN })).status()).toBe(200);
    for (const table of ["users", "saved_places", "contacts", "user_sessions", "mira_messages"]) {
      const col = table === "users" ? "id" : "user_id";
      const [{ n }] = await db.unsafe(`SELECT count(*)::int AS n FROM ${table} WHERE ${col} = $1`, [userId]);
      expect(n, table).toBe(0);
    }
    expect((await (await page.request.get("/api/me")).json()).user).toBeNull();
    await ctx.close();
    await anon.close();
  });
});
