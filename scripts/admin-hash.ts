import { hash } from "@node-rs/argon2";
import { createInterface } from "node:readline/promises";

/**
 * Produce an Argon2id hash for ADMIN_PASSWORD_HASH. Reads the password from stdin so
 * it never appears in shell history or process listings.
 */
async function main() {
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  const pw = (await rl.question("Admin password (min 12 chars): ")).trim();
  rl.close();
  if (pw.length < 12) {
    console.error("Password must be at least 12 characters.");
    process.exit(1);
  }
  const h = await hash(pw, { algorithm: 2, memoryCost: 19456, timeCost: 2, parallelism: 1 });
  console.log("\nRecommended (works everywhere, including .env files):\nb64:" + Buffer.from(h, "utf8").toString("base64"));
  console.log("\nRaw PHC form (secret stores only; dotenv would expand its $ characters):\n" + h);
}

main();
