/**
 * A live link that no longer works (audit P06-007: it used to be a generic "Page not found", which reads like a broken
 * link to someone worried about a person). The same words for a link that ended and one that never existed, so the
 * page reveals nothing about whose link it was.
 */
export default function LinkEnded() {
  return (
    <main id="main" className="mx-auto max-w-md px-4 py-10" aria-labelledby="ended-title">
      <h1 id="ended-title" className="text-2xl font-semibold">This live link has stopped working</h1>
      <p className="mt-2 text-ink-muted">
        Live links stop shortly after a journey ends, or when the person sharing turns them off. Mira can&apos;t show where they are now.
      </p>
      <p className="mt-3 text-ink-muted">If you&apos;re worried about someone, call or message them. If you think they&apos;re in danger, call your local emergency number.</p>
    </main>
  );
}
