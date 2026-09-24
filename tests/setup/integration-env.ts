import { afterAll } from "vitest";
import { applyTestEnv } from "./test-env";
import { resetEnvCache } from "@/server/config/env";
import { closeDb } from "@/server/db/client";

applyTestEnv();
resetEnvCache();

afterAll(async () => {
  await closeDb();
});
