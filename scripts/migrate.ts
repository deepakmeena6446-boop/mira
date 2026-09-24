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

async function main() {
  loadProjectEnv();
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set. Run `npm run env:local` first.");
    process.exit(1);
  }
  await runMigrations(url);
  console.log("Migrations applied.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error("Migration failed:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
