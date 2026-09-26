/**
 * MIRA on Railway — Infrastructure as Code (docs/DEPLOY.md is the step-by-step guide).
 *
 *   postgis  PostgreSQL 17 + PostGIS 3.5 (image service + volume; Railway's stock Postgres has no PostGIS)
 *   web      Next.js (`next start` on $PORT); pre-deploy runs the migrations; restart ON_FAILURE
 *   worker   missed-arrival alerts, purges, aggregation (`node dist/worker.mjs`); restart ALWAYS
 *
 * Secrets are never in this file: they are `preserve()`d and set once with
 * `railway variable set KEY --stdin --service web` (the worker references the web service's values).
 *
 * This file records the desired topology. CLI 4.57.3 does not expose `railway config`;
 * provision with the verified commands in docs/DEPLOY.md and compare settings here.
 * Config as Code
 * (railway.json / railway.toml) is deprecated and new services can't opt into it, so there is
 * deliberately no railway.json in this repo.
 */
import { defineRailway, image, preserve, project, service, volume } from "railway/iac";

export default defineRailway(() => {
  const pgdata = volume("postgis-data");

  const postgis = service("postgis", {
    source: image("postgis/postgis:17-3.5"),
    volumeMounts: { "/var/lib/postgresql/data": pgdata },
    env: {
      POSTGRES_USER: "mira",
      POSTGRES_DB: "mira",
      // Set once, BEFORE the first boot (initdb reads it only then): `openssl rand -hex 32` (URL-safe).
      POSTGRES_PASSWORD: preserve(),
      // A Railway volume's root holds lost+found; initdb needs an empty directory.
      PGDATA: "/var/lib/postgresql/data/pgdata",
    },
  });

  // Private network only (never a public TCP proxy). Hex password => no URL escaping needed.
  const DATABASE_URL = "postgresql://mira:${{postgis.POSTGRES_PASSWORD}}@${{postgis.RAILWAY_PRIVATE_DOMAIN}}:5432/mira";

  const web = service("web", {
    build: "npm run build",
    // Direct commands (not `npm run …` / npx wrappers) so SIGTERM reaches the process on redeploys.
    start: "node_modules/.bin/next start", // = npm run start:prod; reads $PORT (next start: "env: PORT")
    // Pre-deploy runs in a separate container on the private network; a failure stops the deploy.
    preDeploy: "node dist/migrate.mjs", // = npm run db:migrate:prod; waits for the DB, no tsx needed
    // Liveness, not readiness: /api/health/ready is 503 until the worker's first pass, which would
    // block the very first deploy. Point the uptime monitor at /api/health/ready instead.
    healthcheck: "/api/health/live",
    healthcheckTimeout: 120,
    deploy: { restartPolicyType: "ON_FAILURE", restartPolicyMaxRetries: 10 },
    env: {
      NODE_ENV: "production",
      PUBLIC_BETA_STRICT: "on",
      PUBLIC_AGGREGATE_RELEASES: "off",
      PORT: "3000",
      RAILPACK_NODE_VERSION: "24",
      DATABASE_URL,
      APP_BASE_URL: preserve(), // https://<your domain>, no trailing slash
      SESSION_SECRET: preserve(),
      DATA_ENCRYPTION_KEY: preserve(),
      ADMIN_PASSWORD_HASH: preserve(), // the "b64:…" form from `npm run admin:hash`
      PILOT_MANIFEST_PATH: "data/pilot/manifest.json",
      MAP_TILE_URL: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
      MAP_STYLE_URL: "https://tiles.openfreemap.org/styles/positron",
      // Railway's edge overwrites X-Real-IP with the connecting address (docs.railway.com,
      // networking/public-networking/specs-and-limits). Rate limits key on it.
      CLIENT_IP_HEADER: "x-real-ip",
      TRUSTED_PROXY_HOPS: "1",
      // Email: required by PUBLIC_BETA_STRICT for the public launch.
      RESEND_API_KEY: preserve(),
      EMAIL_FROM: preserve(), // "MIRA <alerts@your-domain>"
      // Live providers required by PUBLIC_BETA_STRICT for the public launch.
      GOOGLE_MAPS_SERVER_KEY: preserve(),
      GOOGLE_MAPS_BROWSER_KEY: preserve(),
      GOOGLE_PLACES_HOURS: "on",
      ANTHROPIC_API_KEY: preserve(),
      MAPILLARY_TOKEN: preserve(),
      AUTH_GOOGLE_ID: preserve(),
      AUTH_GOOGLE_SECRET: preserve(),
      VAPID_PUBLIC_KEY: preserve(),
      VAPID_PRIVATE_KEY: preserve(),
      VAPID_SUBJECT: preserve(),
      // Spend ceilings (code defaults: 600 Google calls/min per process, 5000 Mira messages/day).
      GOOGLE_MAX_CALLS_PER_MIN: preserve(),
      MIRA_GLOBAL_DAILY_MAX: preserve(),
    },
  });

  // Only what the worker reads: database, secrets, email, push. No map or AI keys.
  const fromWeb = [
    "DATABASE_URL", "APP_BASE_URL", "SESSION_SECRET", "DATA_ENCRYPTION_KEY", "ADMIN_PASSWORD_HASH", "PILOT_MANIFEST_PATH",
    "MAP_TILE_URL", "RESEND_API_KEY", "EMAIL_FROM", "PUBLIC_AGGREGATE_RELEASES", "VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "VAPID_SUBJECT",
  ] as const;

  const worker = service("worker", {
    // The worker needs only its esbuild bundle, not a Next.js build.
    build: "npm run worker:build",
    start: "node dist/worker.mjs",
    // It exits on purpose when the journeys job stalls (watchdog), so it must always come back.
    deploy: { restartPolicyType: "ALWAYS" },
    env: {
      NODE_ENV: "production",
      RAILPACK_NODE_VERSION: "24",
      ...Object.fromEntries(fromWeb.map((k) => [k, web.env[k]])),
    },
  });

  return project("mira", { resources: [postgis, pgdata, web, worker] });
});
