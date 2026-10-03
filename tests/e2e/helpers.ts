/**
 * TEST-ONLY helpers for end-to-end flows. They talk to the dedicated e2e database and
 * local Mailpit. Time is advanced by moving ETA/purge timestamps into the past so the
 * real worker process performs the transitions.
 */
import { execFileSync } from "node:child_process";
import postgres from "postgres";
import { expect, type APIRequestContext, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { E2E_BASE, E2E_DB, E2E_ADMIN_PASSWORD, MAILPIT_API } from "./e2e-env";
import type { CountryContext } from "../../src/domain/country-context";

export const db = postgres(E2E_DB, { max: 2, onnotice: () => {} });

/** A spot inside the imported OSM placeholder data, so search, routes and nearby work. */
export const GEO = { latitude: 28.6951, longitude: 77.2143 };
export const DEST = "Vishwavidyalaya Metro Gate No. 3";

export const SAME_ORIGIN = { origin: E2E_BASE, "x-mira-request": "1" };

/** TEST-ONLY reverse fixture: the country lookup itself is deterministic, while its emergency
 * facts come from MIRA's reviewed registry. This is not proof that a live geocoder located India.
 * Keep unknown-country and denied-location tests outside this signed-in legacy helper.
 */
export async function fixtureIndiaReverse(page: Page) {
  const reviewed = await page.request.post(`${E2E_BASE}/api/plan/country`, { headers: SAME_ORIGIN, data: { iso: "IN" } });
  expect(reviewed.ok()).toBe(true);
  const country = await reviewed.json() as CountryContext;
  expect(country).toMatchObject({ iso: "IN", emergency: { primary: { number: "112", scope: "all" } } });
  await page.route("**/api/geo/reverse", (route) => {
    // Match the real endpoint's strict request boundary; this fixture must not conceal invalid GPS fields.
    const body = route.request().postDataJSON() as Record<string, unknown>;
    const valid = Object.keys(body).every((key) => ["lat", "lon", "source"].includes(key)) && typeof body.lat === "number" && typeof body.lon === "number" && (body.source === undefined || body.source === "osm");
    return valid ? route.fulfill({ json: { label: "Deterministic India reverse fixture — test only", precise: false, country } }) : route.fulfill({ status: 400, json: { error: "invalid_body", message: "Fixture enforces the real reverse coordinate contract." } });
  });
}

/** TEST-ONLY: a shifted browser clock needs equally shifted fictional GPS timestamps.
 * Otherwise the native OS timestamp correctly becomes stale relative to the simulated date.
 */
export async function fixtureClockedGps(page: Page) {
  await page.addInitScript((point) => {
    const position = (): GeolocationPosition => {
      const coords = { ...point, accuracy: 10, altitude: null, altitudeAccuracy: null, heading: null, speed: null };
      const timestamp = Date.now();
      return { coords: { ...coords, toJSON: () => coords }, timestamp, toJSON: () => ({ coords, timestamp }) };
    };
    Object.defineProperty(navigator.geolocation, "getCurrentPosition", { configurable: true, value: (ok: PositionCallback) => ok(position()) });
    Object.defineProperty(navigator.geolocation, "watchPosition", { configurable: true, value: (ok: PositionCallback) => { ok(position()); return window.setInterval(() => ok(position()), 1000); } });
    Object.defineProperty(navigator.geolocation, "clearWatch", { configurable: true, value: (id: number) => window.clearInterval(id) });
  }, GEO);
}

export async function apiReport(request: APIRequestContext, body: Record<string, unknown>) {
  return request.post("/api/reports", { headers: SAME_ORIGIN, data: { idempotencyKey: crypto.randomUUID(), ...body } });
}

export async function waitFor<T>(fn: () => Promise<T | null | undefined | false>, timeoutMs = 75_000, stepMs = 1000): Promise<T> {
  const end = Date.now() + timeoutMs;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) throw new Error("waitFor timed out");
    await new Promise((r) => setTimeout(r, stepMs));
  }
}

export interface MailSummary {
  ID: string;
  Subject: string;
}
export async function mailsTo(address: string): Promise<MailSummary[]> {
  const res = await fetch(`${MAILPIT_API}/search?query=${encodeURIComponent(`to:"${address}"`)}`);
  return ((await res.json()) as { messages: MailSummary[] }).messages;
}
export async function mailText(id: string): Promise<string> {
  return ((await (await fetch(`${MAILPIT_API}/message/${id}`)).json()) as { Text: string }).Text;
}
export function uniqueAddress(tag: string): string {
  return `${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.test`;
}

/**
 * Each test person gets their own client address (the app reads the proxy-appended
 * X-Forwarded-For), like real people on different phones. Otherwise every sign-up in the suite
 * comes from one address and trips the per-IP sign-up limit (20/hour) partway through a run.
 */
export function testClientIp(): string {
  const b = () => 1 + Math.floor(Math.random() * 250);
  return `10.${b()}.${b()}.${b()}`;
}

/**
 * A fresh person: own browser context with location granted, onboarded (no account needed), then
 * signed in from the sign-in sheet with a first name (demo auth: E2E runs without Google).
 */
export async function newUser(browser: Browser, name: string): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({ geolocation: GEO, permissions: ["geolocation"], extraHTTPHeaders: { "x-forwarded-for": testClientIp() } });
  const page = await ctx.newPage();
  await fixtureIndiaReverse(page);
  await page.goto("/");
  await expect(page).toHaveURL(/\/$/);
  // Phase 1 Home (D39): the live "Right now, around you" card leads, even before location is chosen.
  await expect(page.getByRole("region", { name: "Right now, around you" })).toBeVisible();
  await page.goto("/me");
  await page.getByRole("button", { name: "Get started" }).click();
  await page.getByPlaceholder("Your first name").fill(name);
  await page.getByRole("dialog").getByRole("checkbox", { name: /I confirm I.m 18 or older/ }).check();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: new RegExp(`, ${name}$`) })).toBeVisible();
  // Legacy local-context flows opt in through the UI; root planning needs no GPS.
  await page.goto("/today");
  await page.getByRole("button", { name: "Use my location for local context" }).click();
  await expect(page.getByRole("link", { name: /Emergency call, 112/ }).first()).toBeVisible();
  await page.goto("/");
  return { ctx, page };
}

/** Adds a trusted contact from the Me screen and returns their address. */
export async function addContact(page: Page, name: string, tag: string): Promise<string> {
  const address = uniqueAddress(tag);
  await page.goto("/circle");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByLabel("Name").last().fill(name);
  await page.getByLabel("Email (optional)", { exact: true }).fill(address);
  await page.getByRole("button", { name: "Save and send invite", exact: true }).click();
  await expect(page.getByText("Invited")).toBeVisible();
  return address;
}

/** The contact opens their emailed invite in their own browser and accepts once. */
export async function acceptContactInvite(browser: Browser, address: string): Promise<{ ctx: BrowserContext; page: Page }> {
  const [invite] = await waitFor(async () => {
    const m = await mailsTo(address);
    return m.length ? m : null;
  });
  const link = /http:\/\/localhost:\d+\/invite\/[A-Za-z0-9_-]+/.exec(await mailText(invite.ID))![0];
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(link);
  await expect(page).toHaveURL(/\/invite$/); // token moves into a cookie, out of the URL
  await page.getByRole("button", { name: "Accept" }).click();
  await expect(page.getByText("You've accepted")).toBeVisible();
  return { ctx, page };
}

/** The live /t/ link from the "sharing a trip" email sent to a contact. */
export async function shareLinkFor(address: string): Promise<string> {
  const mail = await waitFor(async () => (await mailsTo(address)).find((m) => m.Subject.includes("sharing a trip")));
  return /http:\/\/localhost:\d+\/t\/[A-Za-z0-9_-]+/.exec(await mailText(mail.ID))![0];
}

/** Open the explicit map and choose a destination in its existing route sheet. */
export async function openRoute(page: Page, name = DEST) {
  await page.goto("/around/map/classic");
  await page.getByRole("button", { name: /Search a place or address/ }).click();
  await page.getByPlaceholder("Search a place or address").fill(name);
  await page.getByRole("button", { name: new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) }).first().click();
  await expect(page.getByRole("button", { name: /Go with Mira/ })).toBeVisible();
}

export async function adminPage(browser: Browser): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await page.goto("/admin/login");
  await page.getByLabel("Moderator password").fill(E2E_ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/admin/reports");
  return page;
}

/** Monday 08:30 IST of the next week (weekly release time used by the operator CLI). */
export function nextIstMonday(): Date {
  const now = new Date();
  const ist = new Date(now.getTime() + 330 * 60_000);
  const daysAhead = ((8 - ist.getUTCDay()) % 7) || 7;
  return new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate() + daysAhead, 3, 0));
}

export function runAggregation(at: Date): string {
  return execFileSync("npx", ["tsx", "scripts/run-aggregation.ts", "--at", at.toISOString()], {
    // Public notes are off by default (no moderation operations yet); this test exercises the release path.
    env: { ...process.env, DATABASE_URL: E2E_DB, PUBLIC_AGGREGATE_RELEASES: "on" },
    encoding: "utf8",
  });
}

export function dockerCompose(...args: string[]) {
  execFileSync("docker", ["compose", ...args], { stdio: "ignore" });
}

export async function expectNoVerdictWords(page: Page) {
  // "I feel unsafe" is her own feeling (the Support button), never a verdict on a place — the output guard allows it too.
  const text = (await page.locator("main").innerText()).replace(/\bI feel unsafe\b/g, "");
  expect(text).not.toMatch(/\b(safe|safer|safest|unsafe|dangerous)\b/i);
}

/**
 * Phase 1 journey (D39): sharing management, timing, position details and ending early sit under
 * one "More" disclosure so the glance stays simple. Opens it if it is closed.
 */
export async function openJourneyMore(page: Page) {
  const summary = page.locator("summary", { hasText: "More — sharing, timing, details" });
  if (!(await summary.evaluate((el) => (el.parentElement as HTMLDetailsElement).open))) await summary.click();
}
