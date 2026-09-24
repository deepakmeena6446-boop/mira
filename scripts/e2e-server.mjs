// Starts the production web server AND worker against a freshly reset e2e database with
// the real sourced pilot import. Used by Playwright's webServer. Test-only.
import { spawn, execFileSync } from "node:child_process";
import postgres from "postgres";

const env = { ...process.env };
const url = env.DATABASE_URL;
if (!url || !url.includes("mira_e2e")) {
  console.error("e2e-server refuses to run against a database not named mira_e2e");
  process.exit(1);
}
const sql = postgres(url, { max: 1, onnotice: () => {} });
await sql.unsafe("DROP SCHEMA IF EXISTS drizzle CASCADE; DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;");
await sql.end();
const run = (args) => execFileSync("npx", ["tsx", ...args], { env, stdio: "inherit" });
run(["scripts/migrate.ts"]);
run(["scripts/import-pilot.ts"]);

const children = [
  spawn("node", ["dist/worker.mjs"], { env, stdio: "inherit" }),
  spawn("npx", ["next", "start", "--port", String(new URL(env.APP_BASE_URL).port)], { env, stdio: "inherit" }),
];
const stop = () => {
  for (const c of children) c.kill("SIGTERM");
  setTimeout(() => process.exit(0), 1500);
};
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
for (const c of children) c.on("exit", (code) => code && code !== 0 && console.error("e2e child exited", code));
