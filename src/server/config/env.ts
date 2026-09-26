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

/** "alerts@example.org" or "MIRA <alerts@example.org>". */
const EMAIL_FROM_PATTERN = /^(?:[^<>@\s]+@[^<>@\s]+\.[^<>@\s]+|[^<>]*<[^<>@\s]+@[^<>@\s]+\.[^<>@\s]+>)$/;

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
  // Contact email over the Resend HTTPS API (production; no outbound SMTP needed). Takes
  // precedence over SMTP when set. See src/server/mail/resend.ts and docs/DEPLOY.md.
  RESEND_API_KEY: optionalNonEmpty,
  // Sender for every MIRA email, e.g. "MIRA <alerts@your-domain>" (a domain verified in Resend).
  // SMTP falls back to it when SMTP_FROM is unset.
  EMAIL_FROM: optionalNonEmpty.refine((v) => v === undefined || EMAIL_FROM_PATTERN.test(v), 'must be an address or "Name <address>"'),
  // SMTP (Mailpit locally, E2E). Used only when RESEND_API_KEY is unset.
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
  // Rate-limit keying behind a proxy (read by src/server/ratelimit). CLIENT_IP_HEADER names a single
  // header the platform edge overwrites with the client address ("x-real-ip" on Railway).
  TRUSTED_PROXY_HOPS: optionalNonEmpty.refine((v) => v === undefined || /^[1-9]$/.test(v), "must be a whole number from 1 to 9"),
  CLIENT_IP_HEADER: optionalNonEmpty.refine((v) => v === undefined || /^[A-Za-z0-9-]{1,64}$/.test(v), "must be a header name"),
  // Sign in with Google (OIDC). Both set = Google is the sign-in; first-name sign-in becomes a fallback.
  AUTH_GOOGLE_ID: optionalNonEmpty,
  AUTH_GOOGLE_SECRET: optionalNonEmpty,
  // "on" = keep first-name (demo) sign-in available even when Google is configured. Default off.
  ALLOW_DEMO_SIGNIN: optionalNonEmpty.refine((v) => v === undefined || v === "on" || v === "off", 'must be "on" or "off"'),
  VAPID_PUBLIC_KEY: optionalNonEmpty,
  VAPID_PRIVATE_KEY: optionalNonEmpty,
  // Contact for push services (mailto: or https:); defaults to APP_BASE_URL.
  VAPID_SUBJECT: optionalNonEmpty.refine((v) => v === undefined || /^(mailto:|https:\/\/)/.test(v), "must start with mailto: or https://"),
  // ── Contributions (Contribute tab, docs/CONTRIBUTIONS.md) ──
  // "on" = the weekly job may publish community notes from approved reports. Default OFF (fail safe)
  // until moderation operations exist: reports stay private and nothing new is published.
  PUBLIC_AGGREGATE_RELEASES: optionalNonEmpty.refine((v) => v === undefined || v === "on" || v === "off", 'must be "on" or "off"'),
  // Local Steward thresholds (beta defaults in src/domain/reputation.ts; not final).
  STEWARD_MIN_VERIFIED: optionalNonEmpty.refine((v) => v === undefined || /^\d{1,5}$/.test(v), "must be a whole number"),
  STEWARD_MIN_ACTIVE_DAYS: optionalNonEmpty.refine((v) => v === undefined || /^\d{1,4}$/.test(v), "must be a whole number"),
  STEWARD_MIN_AREAS: optionalNonEmpty.refine((v) => v === undefined || /^\d{1,4}$/.test(v), "must be a whole number"),
  STEWARD_MIN_AGREEMENT_PCT: optionalNonEmpty.refine((v) => v === undefined || (/^\d{1,3}$/.test(v) && Number(v) <= 100), "must be a whole number from 0 to 100"),
  STEWARD_MIN_ACCOUNT_DAYS: optionalNonEmpty.refine((v) => v === undefined || /^\d{1,4}$/.test(v), "must be a whole number"),
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
  const issues: string[] = [];
  if (env.SMTP_HOST && !env.SMTP_FROM && !env.EMAIL_FROM) issues.push("SMTP_FROM: required when SMTP_HOST is set (or set EMAIL_FROM)");
  if (env.RESEND_API_KEY && !env.EMAIL_FROM) issues.push('EMAIL_FROM: required when RESEND_API_KEY is set (e.g. "MIRA <alerts@your-domain>")');
  // Half an OAuth client is always a mistake: sign-in would fail at the callback, not at boot.
  if (Boolean(env.AUTH_GOOGLE_ID) !== Boolean(env.AUTH_GOOGLE_SECRET)) {
    issues.push(`${env.AUTH_GOOGLE_ID ? "AUTH_GOOGLE_SECRET" : "AUTH_GOOGLE_ID"}: AUTH_GOOGLE_ID and AUTH_GOOGLE_SECRET must be set together`);
  }
  if (issues.length) throw new EnvValidationError(issues);
  return env;
}

/**
 * Non-fatal production problems, logged once per process at startup. The beta must still
 * boot without email: the share link is the primary path, and the UI says email is off.
 */
export function productionWarnings(env: ServerEnv): string[] {
  if (env.NODE_ENV !== "production") return [];
  const warnings: string[] = [];
  if (emailProvider(env) === "none") {
    warnings.push(
      "No email provider (RESEND_API_KEY + EMAIL_FROM, or SMTP_*): contact invites, missed-arrival emails and email sign-in are OFF; share links still work.",
    );
  }
  return warnings;
}

export function getEnv(): ServerEnv {
  if (!cached) {
    cached = parseEnv(process.env);
    for (const message of productionWarnings(cached)) {
      console.warn(JSON.stringify({ t: new Date().toISOString(), src: "config", event: "config.warning", message }));
    }
  }
  return cached;
}

/** Test hook: forget the cached environment after mutating process.env. */
export function resetEnvCache(): void {
  cached = null;
}

export type EmailProvider = "resend" | "smtp" | "none";

/** Which transport sends MIRA's email. Resend (HTTPS API) wins over SMTP when both are set. */
export function emailProvider(env: ServerEnv = getEnv()): EmailProvider {
  if (env.RESEND_API_KEY && env.EMAIL_FROM) return "resend";
  if (env.SMTP_HOST && (env.SMTP_FROM || env.EMAIL_FROM)) return "smtp";
  return "none";
}

/**
 * The one question the app asks: "can MIRA email contacts?" (invites, trip links,
 * missed-arrival alerts, sign-in links). False means those features say they're off, and
 * a missed arrival is recorded `not_attempted`, never `sent`.
 */
export function emailConfigured(env: ServerEnv = getEnv()): boolean {
  return emailProvider(env) !== "none";
}

/** @deprecated Alias of {@link emailConfigured}, kept so call sites needn't change (true for Resend too). */
export const smtpConfigured = emailConfigured;

/** The From header for every MIRA email ("MIRA <alerts@…>"), or undefined when email is off. */
export function emailSender(env: ServerEnv = getEnv()): string | undefined {
  const provider = emailProvider(env);
  if (provider === "resend") return env.EMAIL_FROM;
  if (provider === "smtp") return env.SMTP_FROM ?? env.EMAIL_FROM;
  return undefined;
}

/** Bare sender address, for "add … to your contacts so alerts never land in spam". */
export function emailSenderAddress(env: ServerEnv = getEnv()): string | null {
  const from = emailSender(env);
  if (!from) return null;
  return /<([^>]+)>/.exec(from)?.[1] ?? from;
}

/** Google sign-in works only with both halves of the OAuth client. */
export function googleSignInConfigured(env: ServerEnv = getEnv()): boolean {
  return Boolean(env.AUTH_GOOGLE_ID && env.AUTH_GOOGLE_SECRET);
}

/**
 * First-name sign-in keeps no way back in (no email), so once Google exists it's a fallback only:
 * on when Google isn't configured (local dev, tests) or when the owner explicitly allows it.
 */
export function demoSignInAllowed(env: ServerEnv = getEnv()): boolean {
  return !googleSignInConfigured(env) || env.ALLOW_DEMO_SIGNIN === "on";
}

export function isProduction(env: ServerEnv = getEnv()): boolean {
  return env.NODE_ENV === "production";
}
