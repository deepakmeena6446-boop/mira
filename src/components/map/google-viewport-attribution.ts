export interface GoogleViewport {
  north: number;
  south: number;
  east: number;
  west: number;
  zoom: number;
}

export type ViewportAttribution = { status: "pending" | "unavailable"; copyright?: never } | { status: "ready"; copyright: string };

/** Official 2D viewport endpoint; credentials stay in the existing browser tile session.
 * https://developers.google.com/maps/documentation/tile/2d-tiles-overview
 */
export function googleViewportUrl(tileUrl: string, viewport: GoogleViewport): string {
  const tile = new URL(tileUrl);
  if (tile.origin !== "https://tile.googleapis.com" || !tile.pathname.startsWith("/v1/2dtiles/") || !tile.searchParams.get("session") || !tile.searchParams.get("key")) throw new Error("Invalid Google tile session");
  if (!Object.values(viewport).every(Number.isFinite) || viewport.north < viewport.south || Math.abs(viewport.north) >= 90 || Math.abs(viewport.south) >= 90 || viewport.zoom < 0 || viewport.zoom > 22) throw new Error("Invalid viewport");
  const url = new URL("https://tile.googleapis.com/tile/v1/viewport");
  url.searchParams.set("session", tile.searchParams.get("session")!);
  url.searchParams.set("key", tile.searchParams.get("key")!);
  const longitude = (n: number) => ((n + 180) % 360 + 360) % 360 - 180;
  for (const [key, value] of Object.entries(viewport)) url.searchParams.set(key, String(key === "zoom" ? Math.floor(value) : key === "east" || key === "west" ? longitude(value) : value));
  // MapLibre can expose unwrapped world copies. Do not turn a full-world box into a zero-width box.
  if (viewport.east - viewport.west >= 360) {
    url.searchParams.set("east", "179.999999");
    url.searchParams.set("west", "-179.999999");
  }
  return url.toString();
}

/** One in-flight request, no disk/cache persistence, a bounded timeout and stale-response rejection.
 * Invalidation must also hide the displayed tiles, so an old camera's credit cannot accompany new tiles.
 */
export function googleAttributionSession(tileUrl: string, update: (state: ViewportAttribution) => void, timeoutMs = 4000) {
  let revision = 0;
  let controller: AbortController | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const invalidate = () => {
    revision++;
    controller?.abort();
    clearTimeout(timer);
    update({ status: "pending" });
  };
  const refresh = async (viewport: GoogleViewport) => {
    invalidate();
    const current = revision;
    controller = new AbortController();
    const signal = controller.signal;
    timer = setTimeout(() => {
      if (current !== revision) return;
      controller?.abort();
      revision++;
      update({ status: "unavailable" });
    }, timeoutMs);
    try {
      const response = await fetch(googleViewportUrl(tileUrl, viewport), { signal, cache: "no-store", credentials: "omit" });
      if (!response.ok) throw new Error("Viewport unavailable");
      const body: unknown = await response.json();
      const copyright = body && typeof body === "object" && "copyright" in body ? body.copyright : null;
      if (typeof copyright !== "string" || !copyright.trim() || copyright.length > 20_000) throw new Error("Missing viewport credit");
      if (current === revision && !signal.aborted) update({ status: "ready", copyright });
    } catch {
      if (current === revision && !signal.aborted) update({ status: "unavailable" });
    } finally {
      if (current === revision) clearTimeout(timer);
    }
  };
  const dispose = () => { revision++; controller?.abort(); clearTimeout(timer); };
  return { invalidate, refresh, dispose };
}
