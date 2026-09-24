import { defineConfig, devices } from "@playwright/test";
import { E2E_BASE, e2eServerEnv } from "./tests/e2e/e2e-env";

/**
 * End-to-end flows A–G against the production build (web + worker), a reset e2e
 * database with the real pilot import, and local Mailpit. Serial: flows share state.
 */
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  use: { baseURL: E2E_BASE, trace: "retain-on-failure" },
  projects: [
    { name: "mobile", use: { ...devices["Pixel 7"], browserName: "chromium" } },
    { name: "desktop", use: { viewport: { width: 1280, height: 900 }, browserName: "chromium" } },
  ],
  webServer: {
    command: "node scripts/e2e-server.mjs",
    url: `${E2E_BASE}/api/health/ready`,
    timeout: 180_000,
    reuseExistingServer: false,
    env: e2eServerEnv(),
    stdout: "ignore",
    stderr: "pipe",
  },
});
