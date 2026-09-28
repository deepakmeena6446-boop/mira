/** A titled card section (Me, Circle, Contribute): a sentence-case footnote label over one bordered card. */
export function Section({ id, title, children, action }: { id: string; title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="scroll-mt-6">
      <div className="mb-2 flex items-center justify-between px-1">
        <h2 id={`${id}-h`} className="text-[13px] font-medium text-ink-subtle">
          {title}
        </h2>
        {action}
      </div>
      <div className="overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface">{children}</div>
    </section>
  );
}
