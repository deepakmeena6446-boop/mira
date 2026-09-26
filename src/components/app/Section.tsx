/** A titled card section (Me, Circle). */
export function Section({ id, title, children, action }: { id: string; title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="scroll-mt-6">
      <div className="mb-2 flex items-center justify-between px-1">
        <h2 id={`${id}-h`} className="text-sm font-bold uppercase tracking-wider text-ink-subtle">
          {title}
        </h2>
        {action}
      </div>
      <div className="overflow-hidden rounded-[var(--radius-card)] bg-surface shadow-[var(--shadow-card)]">{children}</div>
    </section>
  );
}
