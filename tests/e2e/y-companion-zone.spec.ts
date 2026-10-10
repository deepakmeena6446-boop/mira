import { expect, test, type Page } from "@playwright/test";
import { parseOpeningHours } from "../../src/domain/opening-hours";

// design/mira-companion-ux: Around a place abroad never reads that place on the phone's clock. The phone is on India
// time; the place is in Lisbon. Synthetic, labelled fixtures stand in for search, Help Points and the zone answer
// (no live provider). 17:40 UTC is 6:40 PM in Lisbon (WEST) and 11:10 PM in Kolkata; the sky changes at 6:55 PM there.
const LISBON = { lat: 38.7139, lon: -9.1394 };
const PLACE = "Synthetic Lisbon Square — test only";
const AT = new Date("2026-10-10T17:40:00Z");
const CLOCK = /\b\d{1,2}:\d{2}\s?(AM|PM)\b/;

async function aroundLisbon(page: Page, zone: (release: Promise<void>) => Promise<{ status: number; body: unknown }>) {
  let open!: () => void;
  const gate = new Promise<void>((r) => { open = r; });
  await page.clock.setFixedTime(AT);
  await page.route("**/api/geo/search", (r) => r.fulfill({ json: { places: [{ id: "osm:synthetic-lisbon", name: PLACE, kind: "square", ...LISBON }] } }));
  await page.route("**/api/geo/help", (r) => r.fulfill({ json: {
    helpPoints: [{ id: "osm:synthetic-lisbon-pharmacy", name: "Synthetic Lisbon Pharmacy — test only", cls: "pharmacy", lat: 38.7141, lon: -9.1390, open24h: false, hours: "Mo-Su 09:00-21:00", schedule: parseOpeningHours("Mo-Su 09:00-21:00"), source: "osm" }],
    evidence: { state: "ready", sources: [{ source: "OpenStreetMap", state: "ready" }], data: [] },
  } }));
  await page.route("**/api/geo/zone", async (r) => { const a = await zone(gate); await r.fulfill({ status: a.status, json: a.body }); });
  await page.goto("/around?check=1");
  await page.getByRole("dialog").getByRole("textbox").fill("Lisbon square");
  await page.getByRole("dialog").getByRole("button", { name: new RegExp(PLACE) }).first().click();
  return { sky: page.getByRole("region", { name: `Around ${PLACE}, now` }), take: page.getByRole("region", { name: "Mira’s take" }), help: page.getByRole("region", { name: "Help Points nearby" }), release: open };
}

test.use({ timezoneId: "Asia/Kolkata" });

test("while a place's zone is being checked, Around gives no clock times or opening hours, then uses the place's own", async ({ page }) => {
  const { sky, take, help, release } = await aroundLisbon(page, async (gate) => { await gate; return { status: 200, body: { timeZone: "Europe/Lisbon" } }; });
  await expect(sky).toContainText("Local time…");
  await expect(help).toContainText("hours wait for local time");
  // Zone-free facts stay: the sky now, and when it changes, said from now.
  await expect(take).toContainText("Daylight now · changes in about 15 min");
  for (const region of [sky, take, help]) await expect(region).not.toContainText(CLOCK);

  release();
  await expect(sky).toContainText("6:40 PM"); // Lisbon, not 11:10 PM on the phone's clock
  await expect(sky).not.toContainText("11:10 PM");
  await expect(take).toContainText("Daylight now · changes about 6:55 PM"); // the same solar change, on Lisbon's clock
  await expect(help).toContainText("open until 9 PM") // listed Mo-Su 09:00-21:00, read on Lisbon's clock;
});

test("when a place's zone can't be found, Around says its local time is unknown instead of using the phone's", async ({ page }) => {
  const { sky, take, help } = await aroundLisbon(page, async () => ({ status: 503, body: { error: "unavailable", message: "Synthetic zone failure — test only." } }));
  await expect(sky).toContainText("Local time unknown");
  await expect(help).toContainText("hours not checked: local time unknown");
  await expect(take).toContainText("Daylight now · changes in about 15 min");
  await expect(take).toContainText("Help Point");
  for (const region of [sky, take, help]) await expect(region).not.toContainText(CLOCK);
  await expect(page.getByText("11:10 PM")).toHaveCount(0);
});
