import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { MiraPulse } from "./MiraPulse";

/**
 * An open journey, compact (docs/launch-ux/06 §2): the one live object, shown on Home and Trips.
 * Who can see her is said plainly; it never implies anyone is watching when nobody is.
 */
export function JourneyCapsule({ title, detail, attention = false, large = false }: { title: string; detail: string; attention?: boolean; large?: boolean }) {
  return (
    <Link
      href="/trip"
      aria-label={`Open your journey: ${title}`}
      className={`flex items-center gap-3 rounded-[var(--radius-card)] border px-4 ${large ? "py-4" : "py-3"} ${attention ? "border-warm/40 bg-warm-soft" : "border-accent/30 bg-accent-soft"}`}
    >
      <MiraPulse size={large ? 20 : 16} state={attention ? "attention" : "with-you"} ambient />
      <span className="min-w-0 flex-1">
        <span className={`block truncate font-semibold ${large ? "text-lg" : ""}`}>{title}</span>
        <span className="block truncate text-sm text-ink-muted">{detail}</span>
      </span>
      <Icon name="chevron" className="size-4 text-ink-subtle" />
    </Link>
  );
}
