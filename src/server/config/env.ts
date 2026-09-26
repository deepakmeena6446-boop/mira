import { z } from "zod";

/**
 * Server-only environment contract (architecture §7).
 *
 * This module has no `server-only` import so the worker and scripts can use it,
 * but it must never be imported from a client component: it reads secrets.
 */

const base64Key32 = z
  .string()
  .min(1)
  .refine((v) => {
    try {
      return Buffer.from(v, "base64").length === 32;
    } catch {
      return false;
    }
  }, "must be a base64-encoded 32-byte key (generate with `npm run env:local` or `openssl rand -base64 32`)");

const secret32 = z
  .string()
  .min(1)
  .refine((v) => {
    const asB64 = safeB64Len(v);
    return asB64 >= 32 || Buffer.byteLength(v, "utf8") >= 43;
  }, "must contain at least 32 random bytes (base64-encoded)");

function safeB64Len(v: string): number {
  try {
    return Buffer.from(v, "base64").length;
  } catch {
    return 0;
  }
}

const optionalNonEmpty = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() !== "" ? v.trim() : undefined));

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  DATABASE_URL: z
    .string()
    .min(1)
    .refine((v) => /^postgres(ql)?:\/\//.test(v), "must be a postgres:// connection URL"),
  APP_BASE_URL: z.url(),
  SESSION_SECRET: secret32,
  DATA_ENCRYPTION_KEY: base64Key32,
  // Raw PHC string, or "b64:" + base64(PHC). The b64 form contains no "$", so it survives
  // dotenv expansion (Next expands a variable defined in both the process env and a .env file).
  ADMIN_PASSWORD_HASH: z
    .string()
    .min(1)
    .transform((v) => (v.startsWith("b64:") ? Buffer.from(v.slice(4), "base64").toString("utf8") : v))
    .refine(
      (v) => /^\$argon2id\$v=\d+\$m=\d+,t=\d+,p=\d+\$[A-Za-z0-9+/]+\$[A-Za-z0-9+/]+$/.test(v),
      "must be an Argon2id PHC string ($argon2id$v=19$m=…) or its b64: form. Generate with `npm run admin:hash`; prefer the b64: form in .env files because dotenv expands $.",
    ),
  PILOT_MANIFEST_PATH: z.string().min(1),
  MAP_TILE_URL: z
    .string()
    .min(1)
    .refine(
      (v) => /^https?:\/\//.test(v) && v.includes("{z}") && v.includes("{x}") && v.includes("{y}"),
      "must be an http(s) raster tile template containing {z}, {x} and {y}",
    ),
  MAP_TILE_ATTRIBUTION: optionalNonEmpty,
  /** Optional vector style (e.g. OpenFreeMap placeholder, later Mapbox). Takes precedence over raster tiles. */
  MAP_STYLE_URL: optionalNonEmpty.refine((v) => v === undefined || /^https:\/\//.test(v), "must be an https:// style URL"),
  MAP_STYLE_URL_NIGHT: optionalNonEmpty.refine((v) => v === undefined || /^https:\/\//.test(v), "must be an https:// style URL"),
  // Placeholder area names outside the local OSM data (Nominatim-compatible). Unset = off.
  OVERPASS_URL: optionalNonEmpty.refine((v) => v === undefined || /^https:\/\//.test(v), "must be an https:// URL"),
  PLACE_SEARCH_URL: optionalNonEmpty.refine((v) => v === undefined || /^https:\/\//.test(v), "must be an https:// URL"),
  REVERSE_GEOCODER_URL: optionalNonEmpty.refine((v) => v === undefined || /^https:\/\//.test(v), "must be an https:// URL"),
  SMTP_HOST: optionalNonEmpty,
  SMTP_PORT: optionalNonEmpty,
  SMTP_USER: optionalNonEmpty,
  SMTP_PASS: optionalNonEmpty,
  SMTP_FROM: optionalNonEmpty,
  SMTP_SECURE: optionalNonEmpty,
  // Real providers (optional; placeholders are used until adapters + keys exist).
  ANTHROPIC_API_KEY: optionalNonEmpty,
  MIRA_MODEL: optionalNonEmpty.refine((v) => v === undefined || /^claude-[a-z0-9-]+$/.test(v), "must be a Claude model id"),
  MAPBOX_TOKEN: optionalNonEmpty,
  // Google Maps Platform: server key (Places API (New), Routes, Geocoding) and browser key (Map Tiles).
  GOOGLE_MAPS_SERVER_KEY: optionalNonEmpty,
  GOOGLE_MAPS_BROWSER_KEY: optionalNonEmpty,
  // Street-lighting layer: streetlight poles detected in Mapillary imagery (optional).
  MAPILLARY_TOKEN: optionalNonEmpty,
  // Spend ceilings (public defaults in code; production may override). See src/server/providers/geo/budget.ts, api/mira.
  GOOGLE_MAX_CALLS_PER_MIN: optionalNonEmpty.refine((v) => v === undefined || /^\d{1,6}$/.test(v), "must be a whole number"),
  // "on" = ask Google for Help Point opening hours (Places Enterprise SKU: higher cost). Default off.
  GOOGLE_PLACES_HOURS: optionalNonEmpty.refine((v) => v === undefined || v === "on" || v === "off", 'must be "on" or "off"'),
  MIRA_GLOBAL_DAILY_MAX: optionalNonEmpty.refine((v) => v === undefined || /^\d{1,7}$/.test(v), "must be a whole number"),
  // Mira's daily token ceiling across everyone (input + output); over it, the scripted Mira answers. Default 2,000,000.
  MIRA_DAILY_TOKEN_MAX: optionalNonEmpty.refine((v) => v === undefined || /^\d{1,10}$/.test(v), "must be a whole number"),
  AUTH_GOOGLE_ID: optionalNonEmpty,
  AUTH_GOOGLE_SECRET: optionalNonEmpty,
  VAPID_PUBLIC_KEY: optionalNonEmpty,
  VAPID_PRIVATE_KEY: optionalNonEmpty,
  // Contact for push services (mailto: or https:); defaults to APP_BASE_URL.
  VAPID_SUBJECT: optionalNonEmpty.refine((v) => v === undefined || /^(mailto:|https:\/\/)/.test(v), "must start with mailto: or https://"),
});

export type ServerEnv = z.infer<typeof envSchema>;

let cached: ServerEnv | null = null;

export class EnvValidationError extends Error {
  constructor(public readonly issues: string[]) {
    super(`MIRA configuration is invalid:\n  - ${issues.join("\n  - ")}`);
    this.name = "EnvValidationError";
  }
}

export function parseEnv(source: Record<string, string | undefined>): ServerEnv {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    // Report variable names and rules only — never echo values.
    const issues = result.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`);
    throw new EnvValidationError(issues);
  }
  const env = result.data;
  if (env.NODE_ENV === "production" && !env.APP_BASE_URL.startsWith("https://")) {
    const local = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/?$/.test(env.APP_BASE_URL);
    if (!local) {
      throw new EnvValidationError(["APP_BASE_URL: production deployments must use https://"]);
    }
  }
  if (env.SMTP_HOST && !env.SMTP_FROM) {
    throw new EnvValidationError(["SMTP_FROM: required when SMTP_HOST is set"]);
  }
  return env;
}

export function getEnv(): ServerEnv {
  if (!cached) cached = parseEnv(process.env);
  return cached;
}

/** Test hook: forget the cached environment after mutating process.env. */
export function resetEnvCache(): void {
  cached = null;
}

export function smtpConfigured(env: ServerEnv = getEnv()): boolean {
  return Boolean(env.SMTP_HOST && env.SMTP_FROM);
}

export function isProduction(env: ServerEnv = getEnv()): boolean {
  return env.NODE_ENV === "production";
}
