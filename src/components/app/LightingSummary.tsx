"use client";

import type { RouteLighting } from "@/domain/lighting";

type Part = { key: string; label: string; pct: number; swatch: string };

/**
 * The route's lighting as labelled parts. Wording follows the source's strength: map data is
 * "mapped as lit" (it can be years old and says nothing about tonight); only walkers who agree
 * can say a stretch is actually lit or dark. The unknown share is always part of the story.
 */
export function lightingParts(lighting: RouteLighting): Part[] {
  const { summary, confirmed = { lit: 0, dark: 0 } } = lighting;
  const parts: Part[] = [
    { key: "confirmedLit", label: "Lit, say MIRA walkers", pct: confirmed.lit, swatch: "bg-[#ffc94d]" },
    { key: "mappedLit", label: "Mapped as lit", pct: summary.lit - confirmed.lit, swatch: "bg-[#ffc94d]" },
    { key: "poles", label: "Streetlights mapped", pct: summary.poles, swatch: "bg-[#ffc94d]/60" },
    { key: "confirmedDark", label: "Dark, say MIRA walkers", pct: confirmed.dark, swatch: "bg-ink-subtle" },
    { key: "mappedDark", label: "Mapped as unlit", pct: summary.dark - confirmed.dark, swatch: "bg-ink-subtle" },
    { key: "unknown", label: "Not known", pct: summary.unknown, swatch: "bg-line-strong" },
  ];
  return parts.filter((p) => p.pct > 0);
}

/** One line for comparing options: "71% mapped as lit · 22% not known". */
export function lightingLine(lighting: RouteLighting | null): string {
  if (!lighting) return "Lighting not known";
  const known = lighting.summary.lit + lighting.summary.poles + lighting.summary.dark;
  if (known === 0) return "Lighting not known";
  const lit = lighting.summary.lit;
  const litLabel = lighting.confirmed?.lit && lighting.confirmed.lit === lit ? "lit (walkers)" : "mapped as lit";
  return [`${lit}% ${litLabel}`, lighting.summary.poles ? `${lighting.summary.poles}% streetlights mapped` : null, `${lighting.summary.unknown}% not known`].filter(Boolean).join(" · ");
}

function sourceList(l: RouteLighting): string {
  return [l.sources.walkers && "MIRA walkers", l.sources.osm && "OpenStreetMap", l.sources.poles && "street imagery (Mapillary)"].filter(Boolean).join(", ");
}

/**
 * How much of a route is lit, from walkers' answers, OpenStreetMap and street imagery.
 * Plain facts with their sources — never a "safe/unsafe" judgement.
 */
export function LightingSummary({ lighting, compact = false }: { lighting: RouteLighting; compact?: boolean }) {
  const { summary } = lighting;
  const known = summary.lit + summary.poles + summary.dark;
  const parts = lightingParts(lighting);
  return (
    <section className={compact ? "" : "mt-5"} aria-label="Street lighting on this route">
      <h3 className="text-sm font-bold uppercase tracking-wider text-ink-subtle">Lighting on the way</h3>
      {known === 0 ? (
        <p className="mt-2 text-sm text-ink-muted">Not known for these streets yet. After a walk at night, you can tell MIRA if it was lit — it helps the next person.</p>
      ) : (
        <>
          <div className="mt-2 flex h-3 overflow-hidden rounded-full bg-sunken" role="img" aria-label={parts.map((p) => `${p.label} ${p.pct}%`).join(", ")}>
            {parts.map((p) => (
              <span key={p.key} className={p.swatch} style={{ width: `${p.pct}%` }} />
            ))}
          </div>
          <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-muted">
            {parts.map((p) => (
              <li key={p.key} className="flex items-center gap-1.5">
                <span aria-hidden className={`size-2.5 rounded-full ${p.swatch}`} /> {p.label} {p.pct}%
              </li>
            ))}
          </ul>
          {compact ? null : (
            <p className="mt-1.5 text-xs text-ink-subtle">
              From {sourceList(lighting)}. Map data can be old and lights can be out — this is about lighting, not a safety rating.
            </p>
          )}
        </>
      )}
    </section>
  );
}
