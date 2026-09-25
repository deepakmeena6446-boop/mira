/**
 * TEST-ONLY environment for end-to-end runs: a separate database (mira_e2e), local
 * Mailpit, and throwaway secrets generated per run. Never used by the running app.
 */
import { randomBytes } from "node:crypto";
import { hashSync } from "@node-rs/argon2";

export const E2E_PORT = 3300;
export const E2E_BASE = `http://localhost:${E2E_PORT}`;
export const E2E_DB = process.env.E2E_DATABASE_URL ?? "postgres://mira:mira_local_dev@127.0.0.1:54329/mira_e2e";
export const E2E_ADMIN_PASSWORD = "e2e-only-moderator-password";
export const MAILPIT_API = "http://127.0.0.1:8025/api/v1";

export function e2eServerEnv(): Record<string, string> {
  return {
    NODE_ENV: "production",
    DATABASE_URL: E2E_DB,
    APP_BASE_URL: E2E_BASE,
    SESSION_SECRET: randomBytes(32).toString("base64"),
    DATA_ENCRYPTION_KEY: randomBytes(32).toString("base64"),
    ADMIN_PASSWORD_HASH: "b64:" + Buffer.from(hashSync(E2E_ADMIN_PASSWORD, { algorithm: 2, memoryCost: 19456, timeCost: 2, parallelism: 1 })).toString("base64"),
    PILOT_MANIFEST_PATH: "data/pilot/manifest.json",
    MAP_TILE_URL: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    MAP_STYLE_URL: "https://tiles.openfreemap.org/styles/positron",
    SMTP_HOST: "127.0.0.1",
    SMTP_PORT: "1025",
    SMTP_FROM: "MIRA <no-reply@mira.test>",
    // Keep Mira on the deterministic placeholder in E2E, even if .env.local has a real key.
    ANTHROPIC_API_KEY: "",
    GOOGLE_MAPS_SERVER_KEY: "",
    GOOGLE_MAPS_BROWSER_KEY: "",
  };
}
