// MapLibre GL v6 runs its tile worker as a separate ES module that imports a shared
// chunk by relative path. Serve both from /maplibre/ so the worker resolves without
// bundler support; copied from node_modules so the version always matches.
import { copyFileSync, mkdirSync } from "node:fs";

mkdirSync("public/maplibre", { recursive: true });
for (const f of ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"]) {
  copyFileSync(`node_modules/maplibre-gl/dist/${f}`, `public/maplibre/${f}`);
}
