"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { Label, Select } from "@/components/ui/Field";
import { api } from "@/lib/api-client";
import { HOLD_REASONS, REASON_LABEL, REJECT_REASONS, WITHDRAW_REASONS } from "@/domain/moderation";
import { CATEGORIES, CATEGORY_LABEL, REPORT_TIME_BANDS, REPORT_TIME_LABEL, TAGS_BY_CATEGORY, TAG_PHRASE, type Category, type ReportTimeBand } from "@/domain/report/taxonomy";
import { PII_LABEL, detectPii } from "@/domain/report/text";
import type { AdminReportDetail } from "@/server/admin/reports";

type Pending = null | "approve" | "reject";

export function ModerationPanel({ report }: { report: AdminReportDetail }) {
  const router = useRouter();
  const [text, setText] = useState<string | null | undefined>(undefined);
  const [textBusy, setTextBusy] = useState(false);
  const [category, setCategory] = useState<Category>((report.structured?.category ?? report.category) as Category);
  const [tags, setTags] = useState<string[]>(report.structured?.tags ?? []);
  const [timeBand, setTimeBand] = useState<ReportTimeBand>((report.structured?.timeBand ?? report.timeBand) as ReportTimeBand);
  const [holdReason, setHoldReason] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [withdrawReason, setWithdrawReason] = useState("");
  const [confirming, setConfirming] = useState<Pending>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "info" | "error"; text: string } | null>(null);

  const unresolvedPii = report.piiFlags.length > 0;
  const terminal = report.status === "rejected";

  const act = async (action: string, extra: Record<string, unknown> = {}) => {
    setBusy(action);
    setMessage(null);
    const res = await api<{ status: string; changed: boolean }>(`/api/admin/reports/${report.id}`, { method: "PATCH", body: { action, ...extra } });
    setBusy(null);
    setConfirming(null);
    if (res.ok) {
      setMessage({ tone: "info", text: res.data.changed ? `Done — report is now ${res.data.status}.` : `No change — report is already ${res.data.status}.` });
      if (action === "redact") setText(undefined);
      router.refresh();
    } else {
      setMessage({ tone: "error", text: res.message });
    }
  };

  const structured = { category, tags, timeBand };

  return (
    <div className="flex flex-col gap-5">
      {message ? (
        <Notice tone={message.tone} role={message.tone === "error" ? "alert" : "status"}>
          {message.text}
        </Notice>
      ) : null}

      <section aria-labelledby="text-h" className="m-card p-5">
        <h2 id="text-h" className="m-h">Private description</h2>
        {!report.hasText ? (
          <p className="mt-2 text-ink-muted">No description was submitted{report.status === "rejected" ? " or it was deleted on rejection" : ""}.</p>
        ) : text === undefined ? (
          <div className="mt-2">
            <p className="text-sm text-ink-muted">Opening the text is recorded in the audit log. Only open it when needed for review.</p>
            <Button
              className="mt-3"
              variant="secondary"
              busy={textBusy}
              onClick={async () => {
                setTextBusy(true);
                const res = await api<{ report: AdminReportDetail }>(`/api/admin/reports/${report.id}?text=1`);
                setTextBusy(false);
                if (res.ok) setText(res.data.report.text ?? null);
                else setMessage({ tone: "error", text: res.message });
              }}
            >
              Open private text
            </Button>
          </div>
        ) : (
          <div className="mt-2">
            <p className="whitespace-pre-wrap rounded-xl bg-sunken p-3 text-mixed">{text}</p>
            {text && detectPii(text).length ? (
              <p className="mt-2 text-sm text-ink-muted">Detected: {[...new Set(detectPii(text).map((s) => PII_LABEL[s.type]))].join(", ")}</p>
            ) : null}
            <Button className="mt-3" variant="ghost" onClick={() => setText(undefined)}>
              Hide text
            </Button>
          </div>
        )}
        {unresolvedPii && !terminal ? (
          <div className="mt-4 rounded-2xl bg-warm-soft p-4">
            <p className="font-semibold">Identifying content detected</p>
            <p className="text-sm text-ink-muted">
              Approval is blocked until the detected spans are redacted. Redaction replaces them with “[removed]” in the private copy. If identifying
              details remain that the detector missed, reject instead.
            </p>
            <Button className="mt-3" variant="secondary" busy={busy === "redact"} onClick={() => act("redact")}>
              Redact detected spans
            </Button>
          </div>
        ) : null}
      </section>

      {!terminal && !report.withdrawn ? (
        <section aria-labelledby="structured-h" className="m-card p-5">
          <h2 id="structured-h" className="m-h">Structured fields for aggregation</h2>
          <p className="mt-1 text-sm text-ink-muted">Only these non-identifying fields can ever contribute to a combined summary. Area: {report.cellId} (fixed).</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="cat">Category</Label>
              <Select
                id="cat"
                value={category}
                onChange={(e) => {
                  setCategory(e.target.value as Category);
                  setTags([]);
                }}
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {CATEGORY_LABEL[c]}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="band">Time of day</Label>
              <Select id="band" value={timeBand} onChange={(e) => setTimeBand(e.target.value as ReportTimeBand)}>
                {REPORT_TIME_BANDS.map((t) => (
                  <option key={t} value={t}>
                    {REPORT_TIME_LABEL[t]}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          {TAGS_BY_CATEGORY[category].length ? (
            <fieldset className="mt-4">
              <legend className="font-semibold">Tags (optional)</legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {TAGS_BY_CATEGORY[category].map((t) => (
                  <label key={t} className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border border-line-strong px-3">
                    <input type="checkbox" checked={tags.includes(t)} onChange={(e) => setTags((xs) => (e.target.checked ? [...xs, t] : xs.filter((x) => x !== t)))} />
                    {TAG_PHRASE[t]}
                  </label>
                ))}
              </div>
            </fieldset>
          ) : null}
          {report.status === "approved" ? (
            <Button className="mt-4" variant="secondary" busy={busy === "edit"} onClick={() => act("edit", { structured })}>
              Save structured changes
            </Button>
          ) : null}
        </section>
      ) : null}

      <section aria-labelledby="actions-h" className="m-card p-5">
        <h2 id="actions-h" className="m-h">Decision</h2>
        <p className="mt-1 text-sm text-ink-muted">Decisions are about publication, privacy and abuse — not about whether the reporter is telling the truth.</p>
        {terminal ? <p className="mt-3">This report was rejected. Its text was deleted; the record is removed within 24 hours.</p> : null}

        {(report.status === "pending" || report.status === "held") && (
          <div className="mt-4 flex flex-col gap-5">
            <div>
              {confirming === "approve" ? (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">Approve these structured fields for aggregation?</span>
                  <Button busy={busy === "approve"} onClick={() => act("approve", { structured })}>
                    Confirm approve
                  </Button>
                  <Button variant="ghost" onClick={() => setConfirming(null)}>
                    Cancel
                  </Button>
                </div>
              ) : (
                <Button onClick={() => setConfirming("approve")} disabled={unresolvedPii}>
                  Approve for aggregation
                </Button>
              )}
            </div>
            {report.status === "pending" ? (
              <div className="flex flex-wrap items-end gap-2">
                <div className="min-w-56">
                  <Label htmlFor="hold">Hold reason</Label>
                  <Select id="hold" value={holdReason} onChange={(e) => setHoldReason(e.target.value)}>
                    <option value="">Choose…</option>
                    {HOLD_REASONS.map((r) => (
                      <option key={r} value={r}>
                        {REASON_LABEL[r]}
                      </option>
                    ))}
                  </Select>
                </div>
                <Button variant="secondary" disabled={!holdReason} busy={busy === "hold"} onClick={() => act("hold", { reason: holdReason })}>
                  Hold
                </Button>
              </div>
            ) : null}
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-56">
                <Label htmlFor="reject">Reject reason</Label>
                <Select id="reject" value={rejectReason} onChange={(e) => setRejectReason(e.target.value)}>
                  <option value="">Choose…</option>
                  {REJECT_REASONS.map((r) => (
                    <option key={r} value={r}>
                      {REASON_LABEL[r]}
                    </option>
                  ))}
                </Select>
              </div>
              {confirming === "reject" ? (
                <>
                  <Button variant="danger" busy={busy === "reject"} onClick={() => act("reject", { reason: rejectReason })}>
                    Confirm reject
                  </Button>
                  <Button variant="ghost" onClick={() => setConfirming(null)}>
                    Cancel
                  </Button>
                </>
              ) : (
                <Button variant="danger" disabled={!rejectReason} onClick={() => setConfirming("reject")}>
                  Reject
                </Button>
              )}
            </div>
          </div>
        )}

        {report.status === "approved" && !report.withdrawn ? (
          <div className="mt-4 flex flex-wrap items-end gap-2">
            <div className="min-w-56">
              <Label htmlFor="withdraw">Withdraw reason</Label>
              <Select id="withdraw" value={withdrawReason} onChange={(e) => setWithdrawReason(e.target.value)}>
                <option value="">Choose…</option>
                {WITHDRAW_REASONS.map((r) => (
                  <option key={r} value={r}>
                    {REASON_LABEL[r]}
                  </option>
                ))}
              </Select>
            </div>
            <Button variant="danger" disabled={!withdrawReason} busy={busy === "withdraw"} onClick={() => act("withdraw", { reason: withdrawReason })}>
              Remove from future releases
            </Button>
          </div>
        ) : null}
        {report.withdrawn ? <p className="mt-3">Withdrawn from aggregation. It won&apos;t contribute to future releases.</p> : null}
      </section>
    </div>
  );
}
