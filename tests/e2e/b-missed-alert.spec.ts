import { expect, test, type Browser } from "@playwright/test";
import { GEO, acceptContactInvite, addContact, db, dockerCompose, mailText, mailsTo, newUser, openRoute, waitFor } from "./helpers";

async function shareTrip(browser: Browser, name: string, accept: boolean) {
  const owner = await newUser(browser, name);
  const address = await addContact(owner.page, "Didi", "didi");
  const contact = accept ? await acceptContactInvite(browser, address) : null;
  await openRoute(owner.page);
  await owner.page.getByRole("button", { name: "Go with Mira" }).click();
  const go = owner.page.getByRole("dialog", { name: "Go with Mira" });
  if (accept) {
    await expect(go.getByRole("button", { name: "Didi", exact: true })).toHaveAttribute("aria-pressed", "false");
    await go.getByRole("button", { name: "Didi", exact: true }).click();
  } else await expect(go.getByRole("button", { name: "Didi", exact: true })).toHaveCount(0);
  await go.getByRole("button", { name: /^Start/ }).click();
  await owner.page.waitForURL("**/trip");
  // She hasn't arrived: ~550 m short of the destination. Left at GEO (inside the 75 m arrival radius), the phone's own
  // fixes auto-arrive the journey after the 45 s dwell — racing the test's late "I'm here" and its missed-state checks.
  await owner.ctx.setGeolocation({ ...GEO, latitude: GEO.latitude - 0.005 });
  const { trip } = await (await owner.page.request.get("/api/trips/current")).json();
  expect(trip.sharedWith.map((recipient: { name: string }) => recipient.name)).toEqual(accept ? ["Didi"] : []);
  return { owner, contact, address, id: trip.id as string };
}

/** TEST-ONLY: move the ETA into the past so the real worker process sees a missed arrival. */
async function missArrival(id: string) {
  await db`UPDATE journeys SET created_at = now() - interval '40 minutes', eta_at = now() - interval '11 minutes' WHERE id = ${id}`;
  return waitFor(async () => {
    const [r] = await db`SELECT state, alert_state FROM journeys WHERE id = ${id}`;
    return r.state === "missed" && r.alert_state !== "claimed" ? r : null;
  });
}

test.describe("Missed arrival — alerts go only to accepted contacts, exactly once", () => {
  test("accepted contact gets one alert with no location in it", async ({ browser }) => {
    const t = await shareTrip(browser, "Meera", true);
    const r = await missArrival(t.id);
    expect(r.alert_state).toBe("sent");
    await t.owner.page.reload();
    await expect(t.owner.page.getByText(/Are you okay\?/)).toBeVisible();
    await expect(t.owner.page.getByText(/provider accepted the missed-check-in message for Didi/)).toBeVisible();
    await expect(t.owner.page.getByText(/Receipt is unknown/).first()).toBeVisible();
    const current = (await (await t.owner.page.request.get("/api/trips/current")).json()).trip;
    expect(current.sharedWith).toEqual([expect.objectContaining({ name: "Didi", alertDelivery: "sent" })]);

    await new Promise((res) => setTimeout(res, 25_000)); // another worker cycle: no second alert
    const alerts = (await mailsTo(t.address)).filter((m) => m.Subject.includes("missed"));
    expect(alerts).toHaveLength(1);
    expect(alerts[0].Subject).toBe("Meera missed their check-in on MIRA");
    const body = await mailText(alerts[0].ID);
    expect(body).toMatch(/http:\/\/localhost:\d+\/t\/[A-Za-z0-9_-]+/); // last shared spot, while the trip is open
    expect(body).not.toMatch(/28\.\d{3}|77\.\d{3}/); // never coordinates in email

    // Arriving late still closes the trip and stops sharing.
    await t.owner.page.getByRole("button", { name: /I'm here/ }).click();
    await expect(t.owner.page.getByText(/You made it/)).toBeVisible();
    await t.owner.ctx.close();
    await t.contact?.ctx.close();
  });

  test("an invited contact who never accepted is not alerted", async ({ browser }) => {
    const t = await shareTrip(browser, "Anu", false);
    const r = await missArrival(t.id);
    expect(r.alert_state).toBe("not_attempted");
    await t.owner.page.reload();
    await expect(t.owner.page.getByText(/Nobody was notified/)).toBeVisible();
    expect((await mailsTo(t.address)).filter((m) => m.Subject.includes("missed") || m.Subject.includes("sharing a trip"))).toHaveLength(0);
    await t.owner.ctx.close();
  });

  test("a rejected email attempt names the recipient and never claims provider acceptance", async ({ browser }) => {
    const t = await shareTrip(browser, "Ira", true);
    dockerCompose("stop", "mailpit");
    try {
      const r = await missArrival(t.id);
      expect(r.alert_state).toBe("failed");
      await t.owner.page.reload();
      await expect(t.owner.page.getByText(/Email was rejected or unconfirmed for Didi/)).toBeVisible();
      await expect(t.owner.page.getByText(/provider accepted the missed-check-in message/)).toHaveCount(0);
      const current = (await (await t.owner.page.request.get("/api/trips/current")).json()).trip;
      expect(current.sharedWith).toEqual([expect.objectContaining({ name: "Didi", alertDelivery: "failed" })]);
    } finally {
      dockerCompose("start", "mailpit");
      await waitFor(async () => (await fetch("http://127.0.0.1:8025/api/v1/info").catch(() => null))?.ok ?? false, 30_000);
    }
    await t.owner.ctx.close();
    await t.contact?.ctx.close();
  });
});
