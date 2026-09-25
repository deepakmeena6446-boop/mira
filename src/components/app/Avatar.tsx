import { cx } from "@/components/ui/cx";

const PALETTE = ["#6a44f5", "#e2557a", "#f08a24", "#0f9d8a", "#3b82f6", "#a855f7"];

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
    <span aria-hidden className={cx("inline-grid shrink-0 place-items-center rounded-full font-bold text-white", className)} style={{ width: size, height: size, background: color, fontSize: size * 0.38 }}>
      {initials || "?"}
    </span>
  );
}
