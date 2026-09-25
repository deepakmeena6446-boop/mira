import { randomBytes } from "node:crypto";
import { hashSync } from "@node-rs/argon2";

/** Test-only moderator password. Its hash is computed per run; never used outside tests. */
export const TEST_ADMIN_PASSWORD = "test-only-moderator-password";

export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://mira:mira_local_dev@127.0.0.1:54329/mira_test";

let adminHash: string | null = null;
function testAdminHash(): string {
  adminHash ??= hashSync(TEST_ADMIN_PASSWORD, { algorithm: 2, memoryCost: 19456, timeCost: 2, parallelism: 1 });
  return adminHash;
}

export function applyTestEnv(overrides: Record<string, string | undefined> = {}): void {
  const base: Record<string, string | undefined> = {
    NODE_ENV: "test",
    DATABASE_URL: TEST_DATABASE_URL,
    APP_BASE_URL: "http://localhost:3100",
    SESSION_SECRET: randomBytes(32).toString("base64"),
    DATA_ENCRYPTION_KEY: randomBytes(32).toString("base64"),
    ADMIN_PASSWORD_HASH: testAdminHash(),
    PILOT_MANIFEST_PATH: "tests/fixtures/manifest.test-only.json",
    MAP_TILE_URL: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    SMTP_HOST: undefined,
    SMTP_PORT: undefined,
    SMTP_FROM: undefined,
    ANTHROPIC_API_KEY: undefined,
    MAPBOX_TOKEN: undefined,
    GOOGLE_MAPS_SERVER_KEY: undefined,
    GOOGLE_MAPS_BROWSER_KEY: undefined,
    ...overrides,
  };
  for (const [k, v] of Object.entries(base)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}
