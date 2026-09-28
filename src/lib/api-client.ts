/**
 * Browser fetch helper for Mira's own API. Always same-origin, always sends the
 * CSRF header, never puts sensitive values in the URL, and distinguishes a
 * request that never reached the server ("not sent") from a server answer.
 */
export type ApiResult<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; code: string; message: string; fields?: string[]; network: boolean };

export async function api<T>(path: string, init: { method?: "GET" | "POST" | "PATCH" | "DELETE"; body?: unknown; signal?: AbortSignal } = {}): Promise<ApiResult<T>> {
  let res: Response;
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
      signal: init.signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
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
