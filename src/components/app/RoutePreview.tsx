import type { PlanOption } from "@/domain/plan-options";

/** Actual selected geometry, shown as an overview rather than a street map or turn guidance. */
export function RoutePreview({ option }: { option: PlanOption }) {
  const xs = option.geometry.map((p) => p[0]); const ys = option.geometry.map((p) => p[1]);
  if (xs.length < 2) return null;
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const span = Math.max(maxX - minX, maxY - minY, 0.00001);
  const points = option.geometry.map(([x, y]) => [20 + (x - minX) / span * 180, 130 - (y - minY) / span * 110]);
  return <div className="rounded-2xl bg-sunken p-3"><svg viewBox="0 0 220 150" role="img" aria-label={`Route overview: ${option.label}, ${(option.meters / 1000).toFixed(1)} kilometres`} className="mx-auto h-36 w-full"><polyline points={points.map((p) => p.join(",")).join(" ")} fill="none" stroke="var(--color-accent)" strokeWidth="4" strokeLinejoin="round" strokeLinecap="round" /><circle cx={points[0][0]} cy={points[0][1]} r="6" fill="var(--color-surface)" stroke="var(--color-accent)" strokeWidth="3" /><circle cx={points.at(-1)![0]} cy={points.at(-1)![1]} r="5" fill="var(--color-accent)" /></svg><p className="text-center text-xs text-ink-muted">Selected route overview · use mapped segment details or open the map</p>{option.originAccessMeters !== undefined && option.originAccessMeters > 0 ? <p className="mt-2 text-center text-xs text-ink-muted">The mapped start is {Math.round(option.originAccessMeters)} m from your chosen origin. Connecting access is unverified.</p> : null}</div>;
}
