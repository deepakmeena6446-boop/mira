/**
 * TEST-ONLY helpers for end-to-end flows. They talk to the dedicated e2e database and
 * local Mailpit. Time is advanced by moving ETA/purge timestamps into the past so the
 * real worker process performs the transitions.
 */
import { execFileSync } from "node:child_process";
import postgres from "postgres";
import { expect, type APIRequestContext, type Browser, type Page } from "@playwright/test";
import { E2E_BASE, E2E_DB, E2E_ADMIN_PASSWORD, MAILPIT_API } from "./e2e-env";

export const db = postgres(E2E_DB, { max: 2, onnotice: () => {} });

export async function placeId(name: string): Promise<string> {
  const [row] = await db<{ id: string }[]>`SELECT id FROM places WHERE name = ${name} LIMIT 1`;
  if (!row) throw new Error(`place not found: ${name}`);
  return row.id;
}

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

export async function pickPlace(page: Page, label: RegExp, name: string) {
  const box = page.getByRole("combobox", { name: label });
  await box.fill(name);
  await page.getByRole("option", { name: new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) }).first().click();
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
    env: { ...process.env, DATABASE_URL: E2E_DB },
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
