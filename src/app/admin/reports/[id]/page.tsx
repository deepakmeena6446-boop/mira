import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSql } from "@/server/db/client";
import { systemClock } from "@/server/clock";
import { getAdmin } from "@/server/admin/auth";
import { getReport } from "@/server/admin/reports";
import { ApiError } from "@/server/http/errors";
import { REASON_LABEL } from "@/domain/moderation";
import { CATEGORY_LABEL, RECENCY_LABEL, REPORT_TIME_LABEL, TAG_PHRASE, type Category, type Recency, type ReportTimeBand } from "@/domain/report/taxonomy";
import { PII_LABEL, type PiiType } from "@/domain/report/text";
import { formatIstDateTime } from "@/lib/time";
import { ModerationPanel } from "./ModerationPanel";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Review report" };

async function load(id: string, adminSessionId: string) {
  try {
    return await getReport(getSql(), id, { includeText: false, adminSessionId });
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}

export default async function ReportDetailPage({ params }: PageProps<"/admin/reports/[id]">) {
  const admin = await getAdmin(getSql(), systemClock);
  if (!admin) redirect("/admin/login");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const report = await load(id, admin.id);
  if (!report) notFound();
  return (
    <div className="flex flex-col gap-5">
      <Link href={`/admin/reports?status=${report.status}`} className="inline-flex min-h-11 items-center self-start font-semibold text-accent hover:underline">
        ← Back to {report.status} queue
      </Link>
      <p className="rounded-[var(--radius-control)] border border-accent/30 bg-accent-soft px-4 py-3 font-medium">
        Approval permits aggregation only; it never publishes this report.
      </p>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <section aria-labelledby="summary-h" className="h-fit rounded-[var(--radius-card)] border border-line bg-surface p-5">
          <h1 id="summary-h" className="text-xl font-bold">
            {CATEGORY_LABEL[report.category as Category]} <span className="text-base font-medium capitalize text-ink-muted">· {report.status}</span>
          </h1>
          <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-ink-muted">Type</dt>
            <dd>{report.involvement === "experienced" ? "Experienced" : "Witnessed"}</dd>
            <dt className="text-ink-muted">Area</dt>
            <dd>Grid cell {report.cellId} (~500 m)</dd>
            <dt className="text-ink-muted">When</dt>
            <dd>
              {RECENCY_LABEL[report.recency as Recency]} · {REPORT_TIME_LABEL[report.timeBand as ReportTimeBand]}
            </dd>
            <dt className="text-ink-muted">Submitted</dt>
            <dd>{formatIstDateTime(report.submittedHour)} (hour only)</dd>
            <dt className="text-ink-muted">PII flags</dt>
            <dd>{report.piiFlags.length ? report.piiFlags.map((f) => `${PII_LABEL[f.type as PiiType] ?? f.type} ×${f.count}`).join(", ") : report.redacted ? "Redacted" : "None detected"}</dd>
            <dt className="text-ink-muted">Hold flags</dt>
            <dd>{report.holdReasons.length ? report.holdReasons.join(", ") : "—"}</dd>
            <dt className="text-ink-muted">Duplicate hints</dt>
            <dd>
              {report.duplicateHints.sameBrowserSimilar} similar from the same browser · {report.duplicateHints.sameText} with identical text
            </dd>
            {report.reviewReason ? (
              <>
                <dt className="text-ink-muted">Last reason</dt>
                <dd>{REASON_LABEL[report.reviewReason] ?? report.reviewReason}</dd>
              </>
            ) : null}
            {report.structured ? (
              <>
                <dt className="text-ink-muted">Approved as</dt>
                <dd>
                  {CATEGORY_LABEL[report.structured.category as Category]} · {REPORT_TIME_LABEL[report.structured.timeBand as ReportTimeBand]}
                  {report.structured.tags.length ? ` · ${report.structured.tags.map((t) => TAG_PHRASE[t] ?? t).join(", ")}` : ""}
                </dd>
              </>
            ) : null}
          </dl>
        </section>
        <ModerationPanel report={report} />
      </div>
    </div>
  );
}
