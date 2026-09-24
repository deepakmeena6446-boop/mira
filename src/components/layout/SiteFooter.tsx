import Link from "next/link";

/** Discreet footer available everywhere (UX spec §1), including the map-source attribution slot. */
export function SiteFooter() {
  return (
    <footer className="mt-12 border-t border-line pb-24 pt-6 md:pb-8">
      <div className="mx-auto flex max-w-5xl flex-col gap-3 px-4 text-sm text-ink-muted sm:flex-row sm:items-center sm:justify-between">
        <nav aria-label="About MIRA">
          <ul className="flex flex-wrap gap-x-5 gap-y-2">
            <li>
              <Link className="inline-flex min-h-11 items-center hover:text-ink hover:underline" href="/privacy">
                About MIRA
              </Link>
            </li>
            <li>
              <Link className="inline-flex min-h-11 items-center hover:text-ink hover:underline" href="/privacy#data">
                Privacy
              </Link>
            </li>
            <li>
              <Link className="inline-flex min-h-11 items-center hover:text-ink hover:underline" href="/privacy#map-sources">
                Map sources
              </Link>
            </li>
          </ul>
        </nav>
        <p>
          Map data ©{" "}
          <a className="underline hover:text-ink" href="https://www.openstreetmap.org/copyright" rel="noreferrer" target="_blank">
            OpenStreetMap contributors
          </a>
          , ODbL.
        </p>
      </div>
    </footer>
  );
}
