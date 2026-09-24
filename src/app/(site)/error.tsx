"use client";

import Link from "next/link";
import { Button } from "@/components/ui/Button";

/** Route error boundary: recoverable, never shows technical details. */
export default function RouteError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <section className="py-10" aria-labelledby="err-title">
      <h1 id="err-title" className="text-2xl font-bold">
        Something went wrong
      </h1>
      <p className="mt-2 max-w-prose text-ink-muted">
        This screen couldn&apos;t load. Nothing you typed was sent anywhere by this error. You can try again.
      </p>
      <div className="mt-5 flex gap-3">
        <Button onClick={() => reset()}>Try again</Button>
        <Link href="/" className="inline-flex min-h-11 items-center rounded-[var(--radius-control)] px-4 font-semibold text-accent hover:bg-accent-soft">
          Go home
        </Link>
      </div>
    </section>
  );
}
