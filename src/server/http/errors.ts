/** Errors that route handlers translate into safe, generic JSON responses. */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly extra?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export const badRequest = (code: string, message: string, extra?: Record<string, unknown>) => new ApiError(400, code, message, extra);
export const unauthorized = () => new ApiError(401, "unauthorized", "Sign in required.");
export const forbidden = (message = "This request isn't allowed.") => new ApiError(403, "forbidden", message);
export const notFound = (message = "Not found.") => new ApiError(404, "not_found", message);
export const conflict = (code: string, message: string) => new ApiError(409, code, message);
export const tooMany = (message = "Too many requests. Please wait a little and try again.") => new ApiError(429, "rate_limited", message);
export const unavailable = (code: string, message: string) => new ApiError(503, code, message);
