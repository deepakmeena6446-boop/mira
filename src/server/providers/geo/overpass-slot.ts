import "server-only";

/**
 * Overpass's public servers ask for about one request a second. One queue for every caller in
 * this process (lighting, Help Points, nearby places): a request waits briefly for its slot
 * rather than failing because someone else asked a moment earlier. Past `maxWaitMs` it throws
 * `overpass_retry_later`, which callers report as a failed source — never as "nothing there".
 */
let nextFree = 0;

export async function overpassSlot(maxWaitMs = 2_000): Promise<void> {
  const now = Date.now();
  const at = Math.max(now, nextFree);
  if (at - now > maxWaitMs) throw new Error("overpass_retry_later");
  nextFree = at + 1_000;
  if (at > now) await new Promise((resolve) => setTimeout(resolve, at - now));
}
