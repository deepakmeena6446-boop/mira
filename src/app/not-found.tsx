import Link from "next/link";

export default function NotFound() {
  return (
    <main id="main" className="mx-auto max-w-5xl px-4 py-10" aria-labelledby="nf-title">
      <h1 id="nf-title" className="text-2xl font-semibold">
        Page not found
      </h1>
      <p className="mt-2 text-ink-muted">This page doesn&apos;t exist or is no longer available.</p>
      <Link href="/" className="mt-5 inline-flex min-h-11 items-center rounded-[var(--radius-control)] bg-accent px-4 font-semibold text-accent-ink">
        Go home
      </Link>
    </main>
  );
}
