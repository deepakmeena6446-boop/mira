import { expect, test, type Browser } from "@playwright/test";
import { db, dockerCompose, mailText, mailsTo, pickPlace, uniqueAddress, waitFor } from "./helpers";

async function startJourney(browser: Browser, contact?: string) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto("/accompany");
  await pickPlace(page, /Destination/, "Vishwavidyalaya Metro Gate No. 4");
  await page.getByText("In 30 min").click();
  if (contact) await page.getByLabel("Their email").fill(contact);
  await page.getByRole("button", { name: "Start journey" }).click();
  await expect(page.getByText("Journey active").first()).toBeVisible();
  const [row] = await db`SELECT id FROM journeys ORDER BY created_at DESC LIMIT 1`;
  return { ctx, page, id: row.id as string };
}

async function acceptInvite(browser: Browser, address: string) {
  const [invite] = await waitFor(async () => {
    const m = await mailsTo(address);
    return m.length ? m : null;
  });
  const link = /http:\/\/localhost:\d+\/invite\/[A-Za-z0-9_-]+/.exec(await mailText(invite.ID))![0];
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(link);
  await expect(page).toHaveURL(/\/invite$/);
  await expect(page.locator("canvas")).toHaveCount(0);
  await page.getByRole("button", { name: "Accept for this journey" }).click();
  await expect(page.getByText("You've accepted")).toBeVisible();
  return { ctx, page, link };
}

/** Move ETA into the past so the real worker sees a missed check-in. */
async function missCheckIn(id: string) {
  await db`UPDATE journeys SET created_at = now() - interval '25 minutes', eta_at = now() - interval '11 minutes' WHERE id = ${id}`;
  // (A "claimed" alert is mid-send; wait for its outcome.)
  return waitFor(async () => {
    const [r] = await db`SELECT state, alert_state FROM journeys WHERE id = ${id}`;
    return r.state === "missed" && r.alert_state !== "claimed" ? r : null;
  });
}

test.describe("Flow D — missed check-in with consented contact", () => {
  test("accepted contact gets exactly one alert; expiry and purge follow", async ({ browser }) => {
    const address = uniqueAddress("contact");
    const owner = await startJourney(browser, address);
    await expect(owner.page.getByText(/Invitation sent/)).toBeVisible();
    const invitee = await acceptInvite(browser, address);
    await owner.page.reload();
    await expect(owner.page.getByText(/Your contact accepted/)).toBeVisible();

    const r = await missCheckIn(owner.id);
    expect(r.alert_state).toBe("sent");
    await owner.page.reload();
    await expect(owner.page.getByText("You missed the check-in.")).toBeVisible();
    await expect(owner.page.getByText(/Contact alert sent/)).toBeVisible();
    await new Promise((res) => setTimeout(res, 25_000)); // another worker cycle: no second attempt
    const mails = await mailsTo(address);
    const alerts = mails.filter((m) => m.Subject.includes("missed"));
    expect(alerts).toHaveLength(1);
    const body = await mailText(alerts[0].ID);
    expect(body).toContain("Destination: Vishwavidyalaya Metro Gate No. 4");
    expect(body).not.toMatch(/28\.\d|77\.\d|https?:\/\/|origin|route/i);

    // Expiry at ETA+30, then deletion.
    await db`UPDATE journeys SET eta_at = now() - interval '31 minutes', created_at = now() - interval '45 minutes' WHERE id = ${owner.id}`;
    await waitFor(async () => (await db`SELECT state FROM journeys WHERE id = ${owner.id}`)[0].state === "expired");
    await owner.page.reload();
    await expect(owner.page.getByRole("heading", { name: "This journey closed automatically." })).toBeVisible();
    await invitee.page.goto(invitee.link);
    await expect(invitee.page.getByRole("heading", { name: "Invitation not available" })).toBeVisible();
    await db`UPDATE journeys SET purge_at = now() WHERE id = ${owner.id}`;
    await waitFor(async () => (await db`SELECT count(*)::int AS n FROM journeys WHERE id = ${owner.id}`)[0].n === 0);
    expect((await db`SELECT count(*)::int AS n FROM journeys WHERE id = ${owner.id}`)[0].n).toBe(0);
    await owner.ctx.close();
    await invitee.ctx.close();
  });

  test("without an accepted contact nobody is notified", async ({ browser }) => {
    const pending = uniqueAddress("pending");
    const owner = await startJourney(browser, pending); // invited but never accepts
    const r = await missCheckIn(owner.id);
    expect(r.alert_state).toBe("not_attempted");
    await owner.page.reload();
    await expect(owner.page.getByText(/No contact was notified/)).toBeVisible();
    expect((await mailsTo(pending)).filter((m) => m.Subject.includes("missed"))).toHaveLength(0);
    await owner.ctx.close();
  });

  test("a mail delivery failure is shown as failed, never as sent", async ({ browser }) => {
    const address = uniqueAddress("fail");
    const owner = await startJourney(browser, address);
    const invitee = await acceptInvite(browser, address);
    dockerCompose("stop", "mailpit");
    try {
      const r = await missCheckIn(owner.id);
      expect(r.alert_state).toBe("failed");
      await owner.page.reload();
      await expect(owner.page.getByText("Delivery failed")).toBeVisible();
      await expect(owner.page.getByText(/Contact alert sent/)).toHaveCount(0);
    } finally {
      dockerCompose("start", "mailpit");
      await waitFor(async () => (await fetch("http://127.0.0.1:8025/api/v1/info").catch(() => null))?.ok ?? false, 30_000);
    }
    await owner.ctx.close();
    await invitee.ctx.close();
  });
});
