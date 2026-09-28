import { ICONS } from "./icon-paths";

/** Small line icons (decorative; always paired with visible text). The set lives in icon-paths.ts. */
/** 20px by default; a size-*, h-* or w-* class overrides it, colour-only classes keep the default size. */
export function Icon({ name, className = "" }: { name: string; className?: string }) {
  const sized = /(^|\s)(size|h|w)-/.test(className);
  const els = ICONS[name] ?? [];
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 ${sized ? "" : "size-5 "}${className}`.trim()}>
      {els.map((e, i) =>
        e[0] === "path" ? <path key={i} d={e[1]} /> : e[0] === "circle" ? <circle key={i} cx={e[1]} cy={e[2]} r={e[3]} /> : <rect key={i} x={e[1]} y={e[2]} width={e[3]} height={e[4]} rx={e[5]} />,
      )}
    </svg>
  );
}
