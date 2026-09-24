import "server-only";
import { z } from "zod";
import { ApiError } from "./errors";

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };

export function json(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), { status, headers: { ...JSON_HEADERS, ...headers } });
}

export function errorResponse(err: ApiError): Response {
  return json({ error: { code: err.code, message: err.message, ...(err.extra ?? {}) } }, err.status);
}

/**
 * Wrap a route handler: ApiErrors become safe JSON; anything else is logged by
 * name only (never message bodies, which could echo user input) and returns 500.
 */
export function handle<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (err) {
      if (err instanceof ApiError) return errorResponse(err);
      const name = err instanceof Error ? err.name : "unknown";
      const code = (err as { code?: unknown })?.code;
      console.error(JSON.stringify({ t: new Date().toISOString(), src: "web", event: "request.failed", error: name, code: typeof code === "string" ? code : null }));
      return json({ error: { code: "server_error", message: "Something went wrong on our side. Please try again." } }, 500);
    }
  };
}

/** Read and validate a JSON body with a hard size limit (rejects oversized bodies). */
export async function readJson<T extends z.ZodType>(req: Request, schema: T, maxBytes = 16_384): Promise<z.infer<T>> {
  const type = req.headers.get("content-type") ?? "";
  if (!type.toLowerCase().startsWith("application/json")) {
    throw new ApiError(415, "unsupported_media_type", "Expected a JSON request.");
  }
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared > maxBytes) throw new ApiError(413, "payload_too_large", "That request is too large.");
  const reader = req.body?.getReader();
  if (!reader) throw new ApiError(400, "invalid_body", "Request body is missing.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      throw new ApiError(413, "payload_too_large", "That request is too large.");
    }
    chunks.push(value);
  }
  let data: unknown;
  try {
    data = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new ApiError(400, "invalid_json", "The request could not be read.");
  }
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    // Field paths only; never echo submitted values.
    const fields = [...new Set(parsed.error.issues.map((i) => i.path.join(".") || "(body)"))];
    throw new ApiError(400, "invalid_fields", "Some fields are missing or invalid.", { fields });
  }
  return parsed.data;
}
