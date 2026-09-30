/**
 * TEST-ONLY helpers for end-to-end flows. They talk to the dedicated e2e database and
 * local Mailpit. Time is advanced by moving ETA/purge timestamps into the past so the
 * real worker process performs the transitions.
 */
import { execFileSync } from "node:child_process";
import postgres from "postgres";
import { expect, type APIRequestContext, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { E2E_BASE, E2E_DB, E2E_ADMIN_PASSWORD, MAILPIT_API } from "./e2e-env";

export const db = postgres(E2E_DB, { max: 2, onnotice: () => {} });

/** A spot inside the imported OSM placeholder data, so search, routes and nearby work. */
export const GEO = { latitude: 28.6951, longitude: 77.2143 };
export const DEST = "Vishwavidyalaya Metro Gate No. 3";

export const SAME_ORIGIN = { origin: E2E_BASE, "x-mira-request": "1" };

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
  await page.goto("/");
  await page.waitForURL("**/welcome");
  await expect(page.getByRole("heading", { name: "Know more. Move freely. Together." })).toBeVisible();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Use my location" }).click();
  await page.waitForURL((u) => u.pathname === "/"); // Home, signed out
  await page.goto("/me");
  await page.getByRole("button", { name: "Get started" }).click();
  await page.getByPlaceholder("Your first name").fill(name);
  await page.getByRole("dialog").getByRole("checkbox", { name: /I confirm I.m 18 or older/ }).check();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await page.goto("/");
  await expect(page.getByText(new RegExp(name)).first()).toBeVisible();
  return { ctx, page };
}

/** Adds a trusted contact from the Me screen and returns their address. */
export async function addContact(page: Page, name: string, tag: string): Promise<string> {
  const address = uniqueAddress(tag);
  await page.goto("/circle");
  await page.getByRole("button", { name: "+ Add" }).click();
  await page.getByLabel("Name").last().fill(name);
  await page.getByLabel("Email").fill(address);
  await page.getByRole("button", { name: "Send invite" }).click();
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
  await page.goto("/around/map");
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
  const text = await page.locator("main").innerText();
  expect(text).not.toMatch(/\b(safe|safer|safest|unsafe|dangerous)\b/i);
}
