import { runMigrations } from "../../scripts/migrate";
import { TEST_DATABASE_URL } from "./test-env";

/** Migrate the dedicated test database once per run. */
export default async function setup() {
  await runMigrations(TEST_DATABASE_URL);
}
