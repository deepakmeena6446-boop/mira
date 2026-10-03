import { expect, test } from "@playwright/test";
import { GEO } from "./helpers";

test("S1 guest can start and end a private foreground loop check-in with location denied", async ({ page, context }) => {
  await context.clearPermissions();
  await page.addInitScript((from) => {
    localStorage.setItem("mira.welcomed", "1");
    const local = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date()).replace(" ", "T");
    sessionStorage.setItem("mira.plan.v1", JSON.stringify({ savedAt: Date.now(), draft: { version: 1, touched: true, activity: "Early run", origin: { kind: "named", query: "North Gate", resolution: { source: "search", name: "North Gate", point: from } }, destination: { query: "", resolution: null }, loop: true, departureLocal: local, timeZone: "Asia/Kolkata", mode: "walk", constraints: "" } }));
    Object.defineProperty(navigator.geolocation, "getCurrentPosition", { configurable: true, value: () => { throw new Error("unexpected GPS request"); } });
  }, { lat: GEO.latitude, lon: GEO.longitude });
  let tripPosts = 0;
  await page.route("**/api/trips", async (route) => { if (route.request().method() === "POST") tripPosts++; await route.continue(); });
  await page.goto("/around/map");
  await page.getByRole("button", { name: "Start manual loop check-in" }).click();
  await expect(page.getByText("Mira cannot verify where you are", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Confirm private check-in" }).click();
  await page.waitForURL("**/trip/local");
  await expect(page.getByRole("heading", { name: "Private check-in" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Check-in timer" })).toContainText("minutes until check-in");
  expect(tripPosts).toBe(0);
  await page.getByRole("button", { name: "I need options" }).click();
  await expect(page.getByRole("dialog", { name: "Right now" }).getByRole("button", { name: "Emergency options" })).toBeVisible();
  await page.getByRole("dialog", { name: "Right now" }).getByRole("button", { name: "Close" }).click();
  await page.reload();
  await expect(page.getByRole("region", { name: "Check-in timer" })).toBeVisible();
  await page.goto("/trips");
  await expect(page.getByRole("link", { name: "Resume private check-in" })).toBeVisible();
  await page.getByRole("link", { name: "Resume private check-in" }).click();
  await page.getByRole("button", { name: "I checked in — end timer" }).click();
  await expect(page.getByRole("status").filter({ hasText: "You ended this check-in." })).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem("mira.local-check-in.v1"))).toBeNull();
});
