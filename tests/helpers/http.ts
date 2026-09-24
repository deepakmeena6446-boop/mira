/** Build requests for calling Next route handlers directly in integration tests. */
export function jsonRequest(path: string, body: unknown, init: { method?: string; headers?: Record<string, string>; origin?: string | null } = {}): Request {
  const headers: Record<string, string> = { "content-type": "application/json", "x-mira-request": "1", ...(init.headers ?? {}) };
  if (init.origin !== null) headers.origin = init.origin ?? "http://localhost:3100";
  return new Request(`http://localhost:3100${path}`, { method: init.method ?? "POST", headers, body: JSON.stringify(body) });
}

export function getRequest(path: string, headers: Record<string, string> = {}): Request {
  return new Request(`http://localhost:3100${path}`, { method: "GET", headers });
}

/** Recursively collect every key in a JSON value. */
export function allKeys(v: unknown, acc = new Set<string>()): Set<string> {
  if (Array.isArray(v)) v.forEach((x) => allKeys(x, acc));
  else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) {
    acc.add(k);
    allKeys(x, acc);
  }
  return acc;
}

/** Field names from private tables that must never appear in public responses. */
export const PRIVATE_FIELD_NAMES = [
  "actor_hash", "actorHash", "encrypted_text", "encryptedText", "narrative", "redaction_flags", "idempotency_key",
  "token_hash", "tokenHash", "encrypted_email", "email", "owner_actor_hash", "destination_label", "reviewed_at",
  "duplicate_group", "report_id", "reportId", "contributors", "count", "exact_time", "created_at",
];
