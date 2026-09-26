/** A successful app request does not imply that every evidence source succeeded. */
export type SourceState = { source: string; state: "ready" | "failed" | "unavailable"; retryable?: boolean };
export type EvidenceState<T> =
  | { state: "ready" | "empty" | "partial"; data: T; sources: SourceState[] }
  | { state: "failed" | "unavailable"; sources: SourceState[]; retryable: boolean };

export function evidenceState<T>(data: T, hasEvidence: boolean, sources: SourceState[]): EvidenceState<T> {
  const success = sources.some((s) => s.state === "ready");
  const failed = sources.some((s) => s.state === "failed");
  const unavailable = sources.some((s) => s.state === "unavailable");
  if (!success) return { state: failed ? "failed" : "unavailable", sources, retryable: failed };
  return { state: failed || unavailable ? "partial" : hasEvidence ? "ready" : "empty", data, sources };
}
