// Bundle the Node processes that run outside Next.js into dist/:
//   dist/worker.mjs        background worker (`npm run worker:start`)
//   dist/migrate.mjs       production migrations (`npm run db:migrate:prod`, Railway pre-deploy)
//   dist/pilot-import.mjs  production pilot-map import (`npm run pilot:import:prod`)
// so production never needs `tsx` (a devDependency) at runtime. Dependencies stay external
// (resolved from node_modules at runtime); `server-only` is aliased to an empty module because
// these are trusted server processes outside the React Server Components graph.
import { build } from "esbuild";

const entries = [
  ["src/worker/main.ts", "dist/worker.mjs"],
  ["scripts/migrate.ts", "dist/migrate.mjs"],
  ["scripts/import-pilot.ts", "dist/pilot-import.mjs"],
];

for (const [entry, outfile] of entries) {
  await build({
    entryPoints: [entry],
    outfile,
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node22",
    packages: "external",
    alias: { "server-only": "./scripts/empty-module.mjs" },
    tsconfig: "tsconfig.json",
    sourcemap: true,
    banner: {
      js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);",
    },
    logLevel: "info",
  });
}
