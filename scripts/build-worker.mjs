// Bundle the worker into dist/worker.mjs. Dependencies stay external (resolved from
// node_modules at runtime); `server-only` is aliased to an empty module because the
// worker is a trusted server process outside the React Server Components graph.
import { build } from "esbuild";

await build({
  entryPoints: ["src/worker/main.ts"],
  outfile: "dist/worker.mjs",
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
