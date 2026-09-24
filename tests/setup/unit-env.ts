import "@testing-library/jest-dom/vitest";
import { applyTestEnv } from "./test-env";
import { resetEnvCache } from "@/server/config/env";

applyTestEnv();
resetEnvCache();
