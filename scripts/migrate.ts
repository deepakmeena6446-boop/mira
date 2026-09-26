import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { pathToFileURL } from "node:url";
import { loadProjectEnv } from "./load-env";

export async function runMigrations(url: string): Promise<void> {
  const sql = postgres(url, { max: 1, onnotice: () => {} });
  try {
    await migrate(drizzle(sql), { migrationsFolder: "db/migrations", migrationsSchema: "drizzle" });
  } finally {
    await sql.end({ timeout: 5 });
  }
}

/**
 * On a first deploy the database service may still be starting when the pre-deploy step runs.
 * Wait for it (up to ~90 s) instead of failing the deploy. Only the error code is printed:
 * messages can contain the host name.
 */
export async function waitForDatabase(url: string, attempts = 30, delayMs = 3000): Promise<void> {
  for (let i = 1; ; i++) {
    const sql = postgres(url, { max: 1, onnotice: () => {}, connect_timeout: 10 });
    try {
      await sql`SELECT 1`;
      return;
    } catch (err) {
      if (i >= attempts) throw err;
      const code = (err as { code?: unknown }).code;
      console.log(`Database not reachable yet (${typeof code === "string" ? code : "error"}); retry ${i}/${attempts - 1}…`);
      await new Promise((r) => setTimeout(r, delayMs));
    } finally {
      await sql.end({ timeout: 5 }).catch(() => {});
    }
  }
}

async function main() {
  loadProjectEnv();
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set. Locally run `npm run env:local`; in production set it in the platform's variables.");
    process.exit(1);
  }
  await waitForDatabase(url);
  await runMigrations(url);
  console.log("Migrations applied.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error("Migration failed:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
