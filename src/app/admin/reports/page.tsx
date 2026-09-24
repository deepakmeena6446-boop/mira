import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSql } from "@/server/db/client";
import { systemClock } from "@/server/clock";
import { getAdmin } from "@/server/admin/auth";
import { countByStatus, listReports } from "@/server/admin/reports";
import { CATEGORY_LABEL, RECENCY_LABEL, REPORT_TIME_LABEL, type Category, type Recency, type ReportTimeBand } from "@/domain/report/taxonomy";
import type { ReportStatus } from "@/domain/moderation";
import { formatIstDateTime } from "@/lib/time";
import { cx } from "@/components/ui/cx";
import { SignOutButton } from "../AdminBar";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Review queue" };

const STATUSES: ReportStatus[] = ["pending", "held", "approved", "rejected"];

export default async function QueuePage({ searchParams }: PageProps<"/admin/reports">) {
  const sql = getSql();
  if (!(await getAdmin(sql, systemClock))) redirect("/admin/login");
  const sp = await searchParams;
  const status = (STATUSES as string[]).includes(String(sp.status)) ? (sp.status as ReportStatus) : "pending";
  const [reports, counts] = await Promise.all([listReports(sql, status), countByStatus(sql)]);
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Review queue</h1>
        <div className="flex items-center gap-2">
          <Link href="/admin/releases" className="inline-flex min-h-11 items-center rounded-full px-4 text-sm font-semibold text-accent hover:bg-accent-soft">
            Public summaries
          </Link>
          <SignOutButton />
        </div>
      </div>
      <p className="rounded-[var(--radius-control)] border border-accent/30 bg-accent-soft px-4 py-3 font-medium">
        Approval permits aggregation only; it never publishes this report.
      </p>
      <nav aria-label="Filter by status">
        <ul className="flex flex-wrap gap-2">
          {STATUSES.map((s) => (
            <li key={s}>
              <Link
                href={`/admin/reports?status=${s}`}
                aria-current={s === status ? "page" : undefined}
                className={cx("inline-flex min-h-11 items-center rounded-full border px-4 font-semibold capitalize", s === status ? "border-accent bg-accent text-accent-ink" : "border-line-strong bg-surface")}
              >
                {s} ({counts[s] ?? 0})
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      {reports.length === 0 ? (
        <p className="rounded-[var(--radius-card)] border border-line bg-surface p-6 text-ink-muted">No {status} reports.</p>
      ) : (
        <div className="overflow-x-auto rounded-[var(--radius-card)] border border-line bg-surface">
          <table className="w-full min-w-[640px] text-left text-sm">
            <caption className="sr-only">{status} reports, oldest first</caption>
            <thead className="border-b border-line bg-sunken">
              <tr>
                <th scope="col" className="px-4 py-3">Submitted (hour)</th>
                <th scope="col" className="px-4 py-3">Category</th>
                <th scope="col" className="px-4 py-3">Area · when</th>
                <th scope="col" className="px-4 py-3">Flags</th>
                <th scope="col" className="px-4 py-3"><span className="sr-only">Open</span></th>
              </tr>
            </thead>
            <tbody>
              {reports.map((r) => (
                <tr key={r.id} className="border-b border-line last:border-0">
                  <td className="px-4 py-3 whitespace-nowrap">{formatIstDateTime(r.submittedHour)}</td>
                  <td className="px-4 py-3">{CATEGORY_LABEL[r.category as Category]}</td>
                  <td className="px-4 py-3">
                    {r.cellId} · {RECENCY_LABEL[r.recency as Recency]} · {REPORT_TIME_LABEL[r.timeBand as ReportTimeBand]}
                  </td>
                  <td className="px-4 py-3">
                    {[
                      ...r.piiFlags.map((f) => `PII: ${f.type.replace("_", " ")}`),
                      ...r.holdReasons.filter((h) => h !== "identifying_content").map((h) => `hold: ${h}`),
                      r.withdrawn ? "withdrawn" : null,
                      r.hasText ? "has text" : null,
                    ]
                      .filter(Boolean)
                      .join(" · ") || "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link href={`/admin/reports/${r.id}`} className="inline-flex min-h-11 items-center font-semibold text-accent hover:underline">
                      Review
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
