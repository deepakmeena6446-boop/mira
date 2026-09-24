import type { CommunitySection, Fact, KnowResponse, RouteResult, SourceInfo } from "@/domain/know-types";
import { TIME_BAND_LABEL } from "@/domain/time-bands";
import { formatIstDate, relativeAge } from "@/lib/time";
import { cx } from "@/components/ui/cx";

export function FactList({ facts }: { facts: Fact[] }) {
  return (
    <ul className="divide-y divide-line">
      {facts.map((f, i) => (
        <li key={`${f.label}-${i}`} className="py-2.5 first:pt-0 last:pb-0">
          <p className="font-medium">
            {f.label}
            {f.value ? <span className="font-normal text-ink-muted">: <span className="text-mixed text-ink">{f.value}</span></span> : null}
          </p>
          {f.note ? <p className="mt-0.5 text-sm text-ink-muted">{f.note}</p> : null}
        </li>
      ))}
    </ul>
  );
}

function SectionCard({ id, title, children, tone = "surface" }: { id: string; title: string; children: React.ReactNode; tone?: "surface" | "sunken" }) {
  return (
    <section aria-labelledby={id} className={cx("rounded-[var(--radius-card)] border border-line p-5", tone === "surface" ? "bg-surface" : "bg-sunken")}>
      <h2 id={id} className="text-lg font-bold">
        {title}
      </h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

const POLARITY_LABEL = { positive: "Positive condition", environmental: "Environment", incident: "Incident-related" } as const;

function ObservationList({ items }: { items: CommunitySection["matching"] }) {
  return (
    <ul className="mt-3 space-y-2">
      {items.map((o) => (
        <li key={o.id} className="rounded-[var(--radius-control)] border border-line bg-canvas px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
            {POLARITY_LABEL[o.polarity]} · {TIME_BAND_LABEL[o.timeBand]}
          </p>
          <p className="mt-1">{o.text}</p>
          <p className="mt-1 text-sm text-ink-muted">
            Weekly summary of {formatIstDate(o.releasedWeek)} · covers the past four weeks · removed after {formatIstDate(o.expiresAt)}
          </p>
        </li>
      ))}
    </ul>
  );
}

export function CommunityEvidence({ community }: { community: CommunitySection }) {
  const coverageLabel =
    community.coverage === "no_recent_community_data" ? "No recent community data" : "Multiple independent recent observations";
  return (
    <SectionCard id="community-h" title="Community observations">
      <p className="inline-flex rounded-full bg-sunken px-3 py-1 text-sm font-semibold">{coverageLabel}</p>
      <p className="mt-2 text-ink-muted">{community.statement}</p>
      {community.matching.length > 0 ? (
        <>
          <h3 className="mt-4 font-semibold">For {TIME_BAND_LABEL[community.selectedBand]}</h3>
          <ObservationList items={community.matching} />
        </>
      ) : null}
      {community.otherBands.length > 0 ? (
        <details className="mt-4">
          <summary className="min-h-11 cursor-pointer py-2 font-semibold text-accent">At other times of day ({community.otherBands.length})</summary>
          <p className="text-sm text-ink-muted">These describe different hours and don&apos;t tell you about {TIME_BAND_LABEL[community.selectedBand]}.</p>
          <ObservationList items={community.otherBands} />
        </details>
      ) : null}
    </SectionCard>
  );
}

export function UnknownsSection({ unknowns }: { unknowns: string[] }) {
  return (
    <SectionCard id="unknowns-h" title="What we don't know" tone="sunken">
      <ul className="space-y-2 text-ink-muted">
        {unknowns.map((u) => (
          <li key={u} className="flex gap-2">
            <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-ink-subtle" />
            <span>{u}</span>
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}

export function SourcesDetails({ source }: { source: SourceInfo }) {
  return (
    <details className="rounded-[var(--radius-card)] border border-line bg-surface px-5 py-3">
      <summary className="min-h-11 cursor-pointer py-2 font-semibold text-accent">Sources and last updated</summary>
      <div className="pb-2 text-sm text-ink-muted">
        <p>
          Mapped information: {source.attribution},{" "}
          <a className="text-accent underline" href={source.copyrightUrl} target="_blank" rel="noreferrer">
            {source.licence}
          </a>
          .
        </p>
        <p className="mt-1">
          Map snapshot taken {formatIstDate(source.snapshotDate)} ({relativeAge(source.snapshotDate)}). MIRA hasn&apos;t checked these details on the ground.
        </p>
        <p className="mt-1">Community observations: reviewed reports combined weekly, shown only when enough independent people contributed.</p>
      </div>
    </details>
  );
}

export function RouteCard({ route, selected, onSelect }: { route: RouteResult; selected: boolean; onSelect?: () => void }) {
  return (
    <article aria-labelledby={`route-${route.id}-h`} className={cx("rounded-[var(--radius-card)] border bg-surface p-5", selected ? "border-accent" : "border-line")}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id={`route-${route.id}-h`} className="flex items-center gap-2 text-lg font-bold">
          <svg aria-hidden width="28" height="8" viewBox="0 0 28 8">
            <line x1="2" y1="4" x2="26" y2="4" stroke={route.label === "Shortest" ? "#3b35a8" : "#3a3f4b"} strokeWidth="4" strokeLinecap="round" strokeDasharray={route.label === "Shortest" ? undefined : "4 4"} />
          </svg>
          {route.label === "Shortest" ? "Shortest mapped path" : "Alternate mapped path"}
        </h3>
        {onSelect ? (
          <button type="button" onClick={onSelect} aria-pressed={selected} className="min-h-11 rounded-full px-3 text-sm font-semibold text-accent hover:bg-accent-soft">
            {selected ? "Highlighted on map" : "Highlight on map"}
          </button>
        ) : null}
      </div>
      <p className="mt-1 text-2xl font-bold">
        About {route.minutes} min <span className="text-base font-medium text-ink-muted">· {route.lengthM.toLocaleString("en-IN")} m</span>
      </p>
      <p className="text-sm text-ink-muted">Estimated walking time at 4.5 km/h.</p>
      <div className="mt-4">
        <FactList facts={route.facts} />
      </div>
      <details className="mt-3">
        <summary className="min-h-11 cursor-pointer py-2 font-semibold text-accent">Path as text ({route.steps.length} parts)</summary>
        <ol className="list-decimal space-y-1 pl-6 text-ink-muted">
          {route.steps.map((s, i) => (
            <li key={i}>
              <span className="text-ink text-mixed">{s.name}</span> — {s.lengthM} m
            </li>
          ))}
        </ol>
      </details>
    </article>
  );
}

export function MappedPlaceSection({ place }: { place: NonNullable<KnowResponse["place"]> }) {
  return (
    <SectionCard id="mapped-h" title="Mapped information">
      <FactList facts={[...place.facts, ...place.nearby]} />
    </SectionCard>
  );
}
