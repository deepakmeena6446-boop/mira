import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes, timingSafeEqual } from "node:crypto";
import { getEnv } from "@/server/config/env";

/**
 * Application-level encryption for private fields (architecture §3):
 * AES-256-GCM with a random 96-bit IV and a purpose label as additional
 * authenticated data, so a ciphertext cannot be moved between columns.
 * Format: "v1." + base64url(iv ‖ ciphertext ‖ tag).
 */
export type Purpose = "report_text" | "journey_destination" | "contact_email" | "share_token" | "saved_place" | "saved_plan" | "user_email" | "push_subscription" | "contribution_subject" | "check_evidence" | "contact_phone" | "email_stop";

function dataKey(): Buffer {
  return Buffer.from(getEnv().DATA_ENCRYPTION_KEY, "base64");
}

export function encryptText(plain: string, purpose: Purpose): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", dataKey(), iv);
  cipher.setAAD(Buffer.from(`mira:${purpose}`));
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return "v1." + Buffer.concat([iv, ct, tag]).toString("base64url");
}

export function decryptText(blob: string, purpose: Purpose): string {
  if (!blob.startsWith("v1.")) throw new Error("Unsupported ciphertext version");
  const raw = Buffer.from(blob.slice(3), "base64url");
  if (raw.length < 12 + 16) throw new Error("Ciphertext too short");
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(raw.length - 16);
  const ct = raw.subarray(12, raw.length - 16);
  const decipher = createDecipheriv("aes-256-gcm", dataKey(), iv);
  decipher.setAAD(Buffer.from(`mira:${purpose}`));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}

const derived = new Map<string, Buffer>();

/** Purpose-separated HMAC keys derived from SESSION_SECRET with HKDF-SHA256. */
function hmacKey(purpose: string): Buffer {
  const secret = getEnv().SESSION_SECRET;
  const cacheKey = `${purpose}\u0000${secret.length}\u0000${secret.slice(0, 4)}`;
  let key = derived.get(cacheKey);
  if (!key) {
    key = Buffer.from(hkdfSync("sha256", Buffer.from(secret, "utf8"), Buffer.from("mira-v1"), Buffer.from(purpose), 32));
    derived.set(cacheKey, key);
  }
  return key;
}

export function hmacHex(purpose: string, value: string): string {
  return createHmac("sha256", hmacKey(purpose)).update(value, "utf8").digest("hex");
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function safeEqualHex(a: string, b: string): boolean {
  const ab = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  return ab.length === bb.length && ab.length > 0 && timingSafeEqual(ab, bb);
}

/** Token hashes stored at rest for actor, admin and invite tokens. */
export function hashToken(kind: "actor" | "admin" | "invite", token: string): string {
  return hmacHex(`token:${kind}`, token);
}
