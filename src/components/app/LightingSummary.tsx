"use client";

import type { RouteLighting } from "@/domain/lighting";
import type { EvidenceState } from "@/domain/evidence-state";

type Part = { key: string; label: string; pct: number; swatch: string };

/**
 * The route's lighting as labelled parts. Wording follows the source's strength: map data is
 * "mapped as lit" (it can be years old and says nothing about tonight); only walkers who agree
 * can say a stretch is actually lit or dark. The unknown share is always part of the story.
 */
export function lightingParts(lighting: RouteLighting): Part[] {
  const { summary, confirmed = { lit: 0, dark: 0 } } = lighting;
  const parts: Part[] = [
    { key: "confirmedLit", label: "Lit, say Mira walkers", pct: confirmed.lit, swatch: "bg-[#ffc94d]" },
    { key: "mappedLit", label: "Mapped as lit", pct: summary.lit - confirmed.lit, swatch: "bg-[#ffc94d]" },
    { key: "poles", label: "Streetlights mapped", pct: summary.poles, swatch: "bg-[#ffc94d]/60" },
    { key: "confirmedDark", label: "Dark, say Mira walkers", pct: confirmed.dark, swatch: "bg-ink-subtle" },
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
  // Only shares that exist (no "0% mapped as lit" noise); the unknown share is shown whenever there is one.
  const s = lighting.summary;
  return [s.lit ? `${lit}% ${litLabel}` : null, s.poles ? `${s.poles}% streetlights mapped` : null, s.dark ? `${s.dark}% mapped as unlit` : null, s.unknown ? `${s.unknown}% not known` : null]
    .filter(Boolean)
    .join(" · ");
}


export function lightingEvidenceLine(evidence: EvidenceState<RouteLighting> | undefined, lighting: RouteLighting | null): string {
  if (!evidence) return lightingLine(lighting);
  if (evidence.state === "failed") return "Mira couldn't check lighting sources right now.";
  if (evidence.state === "unavailable") return "Lighting evidence is unavailable for this route.";
  const prefix = evidence.state === "empty" ? "No mapped lighting evidence from sources checked" : lightingLine("data" in evidence ? evidence.data : lighting);
  // Only a source that failed is "couldn't check"; one this server doesn't use (not configured) isn't a gap to report.
  const failed = evidence.sources.filter((s) => s.state === "failed").map((s) => s.source);
  return failed.length ? `${prefix} · Couldn't check ${failed.join(" and ")}` : prefix;
}

/**
 * Why part (or all) of the lighting is "not known", in one short paragraph — null when every
 * stretch is known. Absence of data is never read as "dark" or "lit".
 */
export function lightingWhy(lighting: RouteLighting | null, evidence?: EvidenceState<RouteLighting>): string | null {
  const ask = "After a walk at night, Mira asks “Was the way lit?” — each answer fills in a stretch for the next person.";
  const failed = evidence?.sources.filter((s) => s.state === "failed").map((s) => s.source) ?? [];
  // A source that didn't answer may well have data: never describe that as "nobody has mapped it".
  if (failed.length) return `Mira couldn't reach ${failed.join(" and ")} just now, so some of what's known may be missing here. Try again in a moment. ${ask}`;
  if (!lighting || lighting.summary.lit + lighting.summary.poles + lighting.summary.dark === 0)
    return `No source Mira uses (OpenStreetMap, street imagery, Mira walkers) has mapped the street lights here yet. That says nothing either way about tonight. ${ask}`;
  if (lighting.summary.unknown <= 0) return null;
  return `“Not known” is the part of this way that no source has mapped yet: it may be lit or not. ${ask}`;
}

/** Sources with their age: "OpenStreetMap (streets last edited 2016–2024)". Old is not current. */
export function sourceList(l: RouteLighting): string {
  const f = l.freshness;
  const osm = f?.osmFrom ? `OpenStreetMap (streets last edited ${f.osmFrom === f.osmTo ? f.osmFrom : `${f.osmFrom}–${f.osmTo}`})` : "OpenStreetMap";
  const poles = f?.polesTo ? `street imagery (Mapillary, last seen ${f.polesTo})` : "street imagery (Mapillary)";
  return [l.sources.walkers && "Mira walkers (last 90 days)", l.sources.osm && osm, l.sources.poles && poles].filter(Boolean).join(", ");
}

/**
 * Every source, and what it said: with data (and its age), checked but nothing mapped here,
 * couldn't be checked just now, or not available on this server. Provenance names what was
 * looked at, not only what had something to show.
 */
/** Source labels arrive from the server as data keys ("MIRA walkers"); the UI names the product "Mira". */
const displaySource = (name: string) => name.replace(/^MIRA\b/, "Mira");

export function sourceDetails(evidence: EvidenceState<RouteLighting> | undefined, lighting: RouteLighting | null): string {
  const withData = lighting ? sourceList(lighting) : "";
  const has = (name: string) =>
    Boolean(lighting && ((name === "MIRA walkers" && lighting.sources.walkers) || (name === "OpenStreetMap" && lighting.sources.osm) || (name === "Mapillary" && lighting.sources.poles)));
  const others = (evidence?.sources ?? [])
    .filter((src) => !has(src.source))
    .map((src) => `${displaySource(src.source)}: ${src.state === "ready" ? "nothing mapped here yet" : src.state === "failed" ? "couldn't check just now" : "not available here"}`);
  const text = [withData ? `From ${withData}.` : null, others.length ? `${others.join("; ")}.` : null].filter(Boolean).join(" ");
  return text || "Mira could not confirm source coverage.";
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
      <h3 className="text-[13px] font-medium text-ink-subtle">
        Lighting on the way{known === 0 && compact ? <span className="text-ink-muted"> · not mapped for these streets yet</span> : null}
      </h3>
      {known === 0 ? (
        // Compact (route sheet): the why lives in "Sources and freshness" right below, so it isn't said twice.
        compact ? null : <p className="mt-2 text-sm text-ink-muted">Not known for these streets yet. After a walk at night, you can tell Mira if it was lit — it helps the next person.</p>
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
              From {sourceList(lighting)}.{lighting.freshness?.osmFrom && new Date().getFullYear() - lighting.freshness.osmFrom >= 5 ? " Some of this map data is over five years old." : ""} Lights can be out or new ones missing — this is about lighting, not a safety rating.
            </p>
          )}
        </>
      )}
    </section>
  );
}
