import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getSql } from "@/server/db/client";
import { systemClock } from "@/server/clock";
import { getPilotInfo, knowPlace, KnowUnavailableError } from "@/server/know";
import { PlaceResult } from "@/components/know/PlaceResult";
import { Notice } from "@/components/ui/Notice";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Place information" };

async function load(id: string) {
  const sql = getSql();
  try {
    const [pilot, data] = await Promise.all([getPilotInfo(sql), knowPlace(sql, id, "now", systemClock)]);
    return { ok: true as const, pilot, data };
  } catch (err) {
    if (err instanceof KnowUnavailableError) return { ok: false as const };
    throw err;
  }
}

export default async function PlacePage({ params }: PageProps<"/know/place/[id]">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const res = await load(id);
  if (!res.ok) {
    return (
      <Notice tone="attention" title="Map information isn't available">
        The pilot map data hasn&apos;t been loaded on this server, so MIRA can&apos;t show place information. Nothing has been generated in its place.
      </Notice>
    );
  }
  if (!res.data?.place) notFound();
  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-3 text-sm">
        <Link href="/know" className="inline-flex min-h-11 items-center font-semibold text-accent hover:underline">
          ← Search places and routes
        </Link>
      </nav>
      <PlaceResult pilot={res.pilot} initial={res.data} />
    </>
  );
}
