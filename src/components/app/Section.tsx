import { Group } from "@/components/mira/Rows";

/** Kept for older call sites: a titled group in the Phase 2 language (docs/phase2-ux/00, Rule zero). */
export function Section({ id, title, children, action }: { id: string; title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return <Group id={id} label={title} action={action}>{children}</Group>;
}
