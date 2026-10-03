import { expect, test } from "@playwright/test";
import { newUser, openRoute } from "./helpers";

/** Phone-first Circle: a WhatsApp number is enough, and the journey screen opens WhatsApp with her own link — never claiming it was sent. */
test("a WhatsApp contact gets a one-tap live link on the journey screen", async ({ browser }, info) => {
  test.skip(info.project.name !== "mobile", "one phone-sized browser is enough");
  const { ctx, page } = await newUser(browser, "Asha");
  await page.goto("/circle");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByLabel("Name").fill("Priya");
  await page.getByLabel("WhatsApp number").fill("+91 98765 43210");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText(/Priya saved/)).toBeVisible();
  await expect(page.getByText("WhatsApp +91 •••• ••3210")).toBeVisible();

  await openRoute(page);
  await page.getByRole("button", { name: "Go with Mira" }).click();
  const go = page.getByRole("dialog", { name: "Go with Mira" });
  await expect(go.getByRole("button", { name: "Priya", exact: true })).toHaveAttribute("aria-pressed", "false");
  await go.getByRole("button", { name: "Priya", exact: true }).click();
  await expect(go).toContainText("you send Priya the link on WhatsApp (you press Send)");
  await go.getByRole("button", { name: /^Start and share with Priya/ }).click();
  await page.waitForURL("**/trip");
  const current = (await (await page.request.get("/api/trips/current")).json()).trip;
  expect(current.sharedWith).toEqual([expect.objectContaining({ name: "Priya", viaEmail: false, linkDelivery: "not_attempted" })]);
  const send = page.getByRole("link", { name: /Send to Priya/ });
  await expect(send).toBeVisible();
  const href = (await send.getAttribute("href"))!;
  expect(href).toMatch(/^https:\/\/wa\.me\/919876543210\?text=/);
  expect(decodeURIComponent(href)).toMatch(/Follow along live on MIRA until I arrive: http\S+\/t\/[A-Za-z0-9_-]+$/);
  await expect(page.getByText(/Couldn.t email your link/)).toHaveCount(0); // a WhatsApp contact is never an email failure

  // Tapping opens WhatsApp (a new tab here); the screen says "opened", never "sent".
  await ctx.route("https://wa.me/**", (route) => route.fulfill({ status: 200, contentType: "text/html", body: "<p>WhatsApp</p>" })); // never the real network
  const popup = ctx.waitForEvent("page");
  await send.click();
  await (await popup).close();
  await expect(page.getByRole("link", { name: "Opened WhatsApp for Priya ✓" })).toBeVisible();
  await expect(page.getByText(/sent to Priya|Priya was notified/i)).toHaveCount(0);
  await ctx.close();
});
