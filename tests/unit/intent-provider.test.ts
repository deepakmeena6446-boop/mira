import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MiraClient } from "@/server/providers/companion/claude";
import type postgres from "postgres";
import { deterministicIntentHints } from "@/domain/plan-intent";
const mock = vi.hoisted(() => ({ create: vi.fn(), spent: vi.fn(), record: vi.fn(), env: { ANTHROPIC_API_KEY: "fictional-provider-key", MIRA_MODEL: "claude-fictional", MIRA_DAILY_TOKEN_MAX: "1000" } }));
vi.mock("@anthropic-ai/sdk", () => ({ default: class { messages = { create: mock.create }; } }));
vi.mock("@/server/config/env", () => ({ getEnv: () => mock.env }));
vi.mock("@/server/providers/companion/budget", () => ({ MIRA_DAILY_TOKEN_DEFAULT: 1000, tokenBudgetSpent: mock.spent, recordTokens: mock.record }));
import { ephemeralIntentHints, extractIntentWithClient } from "@/server/providers/companion/intent";
const message = "Go from River Home to Museum at 9 PM and return at midnight";
const sql = {} as postgres.Sql;
beforeEach(() => { mock.create.mockReset(); mock.spent.mockReset().mockResolvedValue(false); mock.record.mockReset().mockResolvedValue(undefined); mock.create.mockResolvedValue({ content: [{ type: "tool_use", name: "extract_movement_intent", input: deterministicIntentHints(message) }], usage: { input_tokens: 100, output_tokens: 50 } }); });
describe("existing companion's bounded extraction", () => {
  it("uses one forced bounded extraction with no history, location context or action tools", async () => {
    const result = await extractIntentWithClient(message, { messages: { create: mock.create } } as unknown as MiraClient, "claude-fictional");
    expect(result.hints).toMatchObject({ origin: "River Home", destination: "Museum", returnTimeHint: "midnight" });
    const [request, options] = mock.create.mock.calls[0]; expect(request.messages).toEqual([{ role: "user", content: message }]); expect(request.tools).toHaveLength(1); expect(request.max_tokens).toBe(400); expect(options).toMatchObject({ timeout: 5000, maxRetries: 0 });
  });
  it("accounts only aggregate tokens and never upgrades invented facts or names", async () => {
    expect((await ephemeralIntentHints(sql, message)).source).toBe("model"); expect(mock.record.mock.calls[0][1]).toBe(150);
    mock.create.mockResolvedValueOnce({ content: [{ type: "tool_use", name: "extract_movement_intent", input: { ...deterministicIntentHints(message), destination: "Made Up Safe Hotel" } }], usage: { input_tokens: 100, output_tokens: 50 } });
    const fallback = await ephemeralIntentHints(sql, message); expect(fallback.source).toBe("deterministic"); expect(fallback.modelAttempted).toBe(true); expect(fallback.hints.destination).toBe("Museum");
  });
  it("does not call the provider when budget is exhausted or typed coordinates are present", async () => {
    mock.spent.mockResolvedValueOnce(true); expect((await ephemeralIntentHints(sql, message)).source).toBe("deterministic");
    for (const text of ["Run from 51.4700, -0.4500 at 4:45 AM", "Run from 51, -1 at 4:45 AM", "Walk from latitude: 51 and longitude: -1"]) {
      expect(await ephemeralIntentHints(sql, text)).toMatchObject({ source: "deterministic", modelAttempted: false });
    }
    expect(mock.create).not.toHaveBeenCalled();
  });
  it("provider failure gives the deterministic answer without logging request/error text", async () => {
    mock.create.mockRejectedValueOnce(new Error(`provider echoed sensitive ${message}`));
    const log = vi.spyOn(console, "warn").mockImplementation(() => {});
    try { expect(await ephemeralIntentHints(sql, message)).toMatchObject({ source: "deterministic", modelAttempted: true }); expect(log).not.toHaveBeenCalled(); } finally { log.mockRestore(); }
  });
});
