import { expect, test } from "@playwright/test";
import { expectNoVerdictWords, pickPlace, placeId } from "./helpers";

test.describe("Flow F — sparse data and outside-pilot requests", () => {
  test("sparse data states insufficiency, never a verdict", async ({ page }) => {
    const pid = await placeId("Apollo Pharmacy");
    await page.goto(`/know/place/${pid}`);
    await expect(page.getByText("Mapped pharmacy")).toBeVisible();
    await expect(page.getByText("No recent community data")).toBeVisible();
    await expect(page.getByText(/This is not a statement about current conditions/)).toBeVisible();
    await expectNoVerdictWords(page);
  });

  test("outside the pilot: coverage message, no route, location not sent", async ({ browser }) => {
    const ctx = await browser.newContext({ geolocation: { latitude: 28.6315, longitude: 77.2167 }, permissions: ["geolocation"] });
    const page = await ctx.newPage();
    const knowCalls: string[] = [];
    page.on("request", (r) => r.url().includes("/api/know") && knowCalls.push(r.url()));
    await page.goto("/know");
    await pickPlace(page, /Where to\?/, "Vishwavidyalaya Metro Gate No. 1");
    await page.getByRole("button", { name: /Use my location/ }).click();
    await expect(page.getByText("MIRA does not cover this area yet")).toBeVisible();
    await expect(page.getByText(/Your location wasn't sent to MIRA/)).toBeVisible();
    expect(knowCalls).toHaveLength(0);

    const res = await page.request.post("/api/know", { data: { mode: "route", origin: { lat: 28.6315, lon: 77.2167 }, destination: { placeId: await placeId("Vishwavidyalaya Metro Gate No. 1") } } });
    const body = await res.json();
    expect(body.coverage).toBe("outside");
    expect(body.routes).toBeUndefined();

    await page.getByRole("combobox", { name: /Where to\?/ }).fill("Connaught Place");
    await expect(page.getByText(/No matching places in the pilot area/).first()).toBeVisible();
    await ctx.close();
  });

  test("location denied falls back to manual selection", async ({ browser }) => {
    const ctx = await browser.newContext({ permissions: [] });
    const page = await ctx.newPage();
    await page.goto("/know");
    await page.getByRole("button", { name: /Use my location/ }).click();
    await expect(page.getByText(/Location permission was declined/)).toBeVisible();
    await expect(page.getByRole("combobox", { name: /Starting from/ })).toBeVisible();
    await ctx.close();
  });
});
