// Scan built client assets (.next/static) for secrets and server-only material.
// Run after `npm run build`. Exits non-zero on any finding.
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = ".next/static";
if (!existsSync(root)) {
  console.error("No .next/static — run `npm run build` first.");
  process.exit(2);
}
const needles = ["postgres://", "postgresql://", "$argon2id$", "DATA_ENCRYPTION_KEY", "SESSION_SECRET", "ADMIN_PASSWORD_HASH", "SMTP_PASS", "OPENAI_API_KEY", "mira_local_dev", "BEGIN PRIVATE KEY"];
// Also look for the literal values of secrets in the local env files.
for (const f of [".env.local", ".env.production.local", ".env"]) {
  if (!existsSync(f)) continue;
  for (const line of readFileSync(f, "utf8").split("\n")) {
    const m = /^(SESSION_SECRET|DATA_ENCRYPTION_KEY|ADMIN_PASSWORD_HASH|SMTP_PASS|OPENAI_API_KEY|DATABASE_URL)=(.+)$/.exec(line.trim());
    if (m && m[2].length >= 12) needles.push(m[2].replaceAll("\\$", "$"));
  }
}
function* walk(d) {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (statSync(p).isDirectory()) yield* walk(p);
    else yield p;
  }
}
let files = 0;
const findings = [];
for (const p of walk(root)) {
  if (/\.(?:js|css)$/.test(p)) files += 1;
  const text = readFileSync(p, "utf8");
  for (const n of needles) if (text.includes(n)) findings.push(`${p}: contains ${n.length > 24 ? n.slice(0, 6) + "…(secret value)" : n}`);
}
if (files === 0) {
  console.error("Client bundle audit FAILED: no JavaScript or CSS client assets were scanned.");
  process.exit(2);
}
if (findings.length) {
  console.error("Client bundle audit FAILED:\n" + findings.join("\n"));
  process.exit(1);
}
console.log(`Client bundle audit passed: ${files} files, ${needles.length} patterns, no secrets found.`);
