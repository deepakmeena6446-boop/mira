import { cx } from "@/components/ui/cx";

// Muted, warm-neutral hues: people are distinguishable without the avatars shouting.
const PALETTE = ["#1d6b63", "#8a5a2b", "#5b6b8c", "#7a5c7a", "#4d7a4a", "#8c5a4f"];

export function Avatar({ name, src, size = 40, className }: { name: string; src?: string | null; size?: number; className?: string }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
  const color = PALETTE[[...name].reduce((s, c) => s + c.charCodeAt(0), 0) % PALETTE.length];
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="" width={size} height={size} className={cx("rounded-full object-cover", className)} style={{ width: size, height: size }} />;
  }
  return (
    <span aria-hidden className={cx("inline-grid shrink-0 place-items-center rounded-full font-semibold text-white", className)} style={{ width: size, height: size, background: color, fontSize: size * 0.38 }}>
      {initials || "?"}
    </span>
  );
}
