/**
 * Browser fetch helper for Mira's own API. Always same-origin, always sends the
 * CSRF header, never puts sensitive values in the URL, and distinguishes a
 * request that never reached the server ("not sent") from a server answer.
 */
export type ApiResult<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; code: string; message: string; fields?: string[]; network: boolean };

/**
 * How long a call may hang before the screen says so (audit L06-007: a stalled dependency used to spin "Checking…"
 * for minutes). A timeout is reported like a lost connection — the request may still have reached the server — so
 * callers that keep their idempotency key on `network` stay safe to retry.
 */
export const API_TIMEOUT_MS = 25_000;

export async function api<T>(path: string, init: { method?: "GET" | "POST" | "PATCH" | "DELETE"; body?: unknown; signal?: AbortSignal; timeoutMs?: number } = {}): Promise<ApiResult<T>> {
  let res: Response;
  const timeout = AbortSignal.timeout(init.timeoutMs ?? API_TIMEOUT_MS);
  const signal = init.signal && typeof AbortSignal.any === "function" ? AbortSignal.any([init.signal, timeout]) : (init.signal ?? timeout);
  try {
    res = await fetch(path, {
      method: init.method ?? (init.body === undefined ? "GET" : "POST"),
      headers: {
        "x-mira-request": "1",
        ...(init.body !== undefined ? { "content-type": "application/json" } : {}),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      credentials: "same-origin",
      cache: "no-store",
      signal,
    });
  } catch (err) {
    // The caller's own abort is rethrown as before; our timeout is a "couldn't confirm" answer.
    if (err instanceof DOMException && err.name === "AbortError" && init.signal?.aborted) throw err;
    if (err instanceof DOMException && (err.name === "TimeoutError" || err.name === "AbortError")) {
      return { ok: false, status: 0, code: "timeout", message: "Mira is taking too long to answer. Check your connection and try again.", network: true };
    }
    return {
      ok: false,
      status: 0,
      code: "network",
      message: "We couldn't reach Mira. Check your connection and try again.",
      network: true,
    };
  }
  let payload: unknown = null;
  try {
    payload = await res.json();
  } catch {
    if (signal.aborted && !init.signal?.aborted) return { ok: false, status: 0, code: "timeout", message: "Mira is taking too long to answer. Check your connection and try again.", network: true };
    payload = null;
  }
  if (res.ok) return { ok: true, status: res.status, data: payload as T };
  const e = (payload as { error?: { code?: string; message?: string; fields?: string[] } } | null)?.error;
  return {
    ok: false,
    status: res.status,
    code: e?.code ?? "server_error",
    message: e?.message ?? "Something went wrong on our side. Please try again.",
    fields: e?.fields,
    network: false,
  };
}
