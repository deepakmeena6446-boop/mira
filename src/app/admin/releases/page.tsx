import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSql } from "@/server/db/client";
import { systemClock } from "@/server/clock";
import { getAdmin } from "@/server/admin/auth";
import { listActiveReleases } from "@/server/admin/releases";
import { formatIstDate } from "@/lib/time";
import { SuppressButton } from "./SuppressButton";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Public summaries" };

export default async function ReleasesPage() {
  const sql = getSql();
  if (!(await getAdmin(sql, systemClock))) redirect("/admin/login");
  const releases = await listActiveReleases(sql, systemClock.now());
  return (
    <div className="flex flex-col gap-5">
      <Link href="/admin/reports" className="inline-flex min-h-11 items-center self-start font-semibold text-accent hover:underline">
        ← Review queue
      </Link>
      <h1 className="text-2xl font-bold">Public community summaries</h1>
      <p className="text-ink-muted">
        These are the weekly, thresholded summaries currently shown in Know. Remove one immediately if it poses a privacy risk; the removal is audited.
      </p>
      {releases.length === 0 ? (
        <p className="rounded-[var(--radius-card)] border border-line bg-surface p-6 text-ink-muted">No summaries are currently public.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {releases.map((r) => (
            <li key={r.id} className="rounded-[var(--radius-card)] border border-line bg-surface p-5">
              <p className="text-sm text-ink-muted">
                Week of {formatIstDate(r.releaseWeek)} · cell {r.cellId} · {r.timeBand} · expires {formatIstDate(r.expiresAt)}
              </p>
              <p className="mt-1 font-medium">{r.copy}</p>
              <div className="mt-3">
                <SuppressButton id={r.id} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
