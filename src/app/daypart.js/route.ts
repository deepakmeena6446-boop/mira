import { DAYPART_BOOT_SCRIPT } from "@/domain/daypart";

/**
 * The pre-paint theme script, served same-origin (CSP 'self') so the root layout can
 * load it with <script src> — no inline HTML injection anywhere in the app.
 */
export const dynamic = "force-static";

export function GET() {
  return new Response(DAYPART_BOOT_SCRIPT, {
    headers: { "content-type": "text/javascript; charset=utf-8", "cache-control": "public, max-age=3600" },
  });
}
