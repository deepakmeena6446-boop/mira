/**
 * Create an empty, reviewed-by-hand SQL migration and register it in the Drizzle
 * migration journal. Usage: npm run db:new-migration -- <name>
 */
import { readFileSync, writeFileSync } from "node:fs";

const name = (process.argv[2] ?? "").replace(/[^a-z0-9_]/gi, "_").toLowerCase();
if (!name) {
  console.error("Usage: npm run db:new-migration -- <name>");
  process.exit(1);
}
const journalPath = "db/migrations/meta/_journal.json";
const journal = JSON.parse(readFileSync(journalPath, "utf8")) as { entries: Array<{ idx: number; tag: string; when: number }> };
const idx = journal.entries.length;
const tag = `${String(idx).padStart(4, "0")}_${name}`;
// Note: drizzle splits on the literal breakpoint marker even inside comments, so the header never contains it.
writeFileSync(`db/migrations/${tag}.sql`, `-- ${tag} (forward-only). Separate statements with the drizzle breakpoint marker line.\n`);
journal.entries.push({ idx, version: "7", when: Date.now(), tag, breakpoints: true } as never);
writeFileSync(journalPath, JSON.stringify(journal, null, 2) + "\n");
console.log(`Created db/migrations/${tag}.sql`);
