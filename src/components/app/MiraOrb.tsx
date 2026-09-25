import { cx } from "@/components/ui/cx";

/** Mira's visual identity: a soft, breathing gradient orb with a spark. */
export function MiraOrb({ size = 40, className, calm = false }: { size?: number; className?: string; calm?: boolean }) {
  return (
    <span aria-hidden className={cx("relative inline-grid shrink-0 place-items-center rounded-full bg-mira shadow-[0_8px_24px_-8px_rgb(106_68_245/0.6)]", !calm && "animate-breathe", className)} style={{ width: size, height: size }}>
      <span className="absolute inset-[18%] rounded-full bg-white/25 blur-[2px]" />
      <svg viewBox="0 0 24 24" width={size * 0.46} height={size * 0.46} className="relative text-white" fill="currentColor">
        <path d="M12 2.5c.5 3.9 2.6 6 6.5 6.5-3.9.5-6 2.6-6.5 6.5-.5-3.9-2.6-6-6.5-6.5 3.9-.5 6-2.6 6.5-6.5Zm6 12c.25 1.9 1.1 2.75 3 3-1.9.25-2.75 1.1-3 3-.25-1.9-1.1-2.75-3-3 1.9-.25 2.75-1.1 3-3Z" />
      </svg>
    </span>
  );
}
