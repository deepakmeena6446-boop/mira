"use client";

import type { RouteLighting } from "@/domain/lighting";

const LABEL = { lit: "Lit", poles: "Streetlights mapped", dark: "Reported dark", unknown: "Not known yet" } as const;
const SWATCH = { lit: "bg-[#ffc94d]", poles: "bg-[#ffc94d]/75", dark: "bg-ink-subtle", unknown: "bg-line-strong" } as const;
const ORDER = ["lit", "poles", "dark", "unknown"] as const;

/**
 * How much of a route is lit, from walkers' answers, OpenStreetMap and street imagery.
 * Plain facts with their sources — never a "safe/unsafe" judgement.
 */
export function LightingSummary({ lighting }: { lighting: RouteLighting }) {
  const { summary, sources } = lighting;
  const known = summary.lit + summary.poles + summary.dark;
  const from = [sources.walkers && "MIRA walkers", sources.osm && "OpenStreetMap", sources.poles && "street imagery"].filter(Boolean) as string[];
  return (
    <section className="mt-5" aria-label="Street lighting on this route">
      <h3 className="text-sm font-bold uppercase tracking-wider text-ink-subtle">Lighting on the way</h3>
      {known === 0 ? (
        <p className="mt-2 text-sm text-ink-muted">No lighting information for these streets yet. After a walk at night, you can tell me if it was lit — it helps everyone.</p>
      ) : (
        <>
          <div className="mt-2 flex h-3 overflow-hidden rounded-full bg-sunken" role="img" aria-label={ORDER.filter((s) => summary[s]).map((s) => `${LABEL[s]} ${summary[s]}%`).join(", ")}>
            {ORDER.map((s) => (summary[s] ? <span key={s} className={SWATCH[s]} style={{ width: `${summary[s]}%` }} /> : null))}
          </div>
          <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-muted">
            {ORDER.filter((s) => summary[s]).map((s) => (
              <li key={s} className="flex items-center gap-1.5">
                <span aria-hidden className={`size-2.5 rounded-full ${SWATCH[s]}`} /> {LABEL[s]} {summary[s]}%
              </li>
            ))}
          </ul>
          <p className="mt-1.5 text-xs text-ink-subtle">
            From {from.join(", ")}. Lights can be out or new ones missing — this is about lighting, not a safety rating.
          </p>
        </>
      )}
    </section>
  );
}
