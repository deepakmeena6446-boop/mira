"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Field";
import { api } from "@/lib/api-client";
import { REASON_LABEL, WITHDRAW_REASONS } from "@/domain/moderation";

export function SuppressButton({ id }: { id: string }) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="sr-only" htmlFor={`r-${id}`}>
        Reason
      </label>
      <Select id={`r-${id}`} value={reason} onChange={(e) => setReason(e.target.value)} className="w-52">
        <option value="">Reason…</option>
        {WITHDRAW_REASONS.map((r) => (
          <option key={r} value={r}>
            {REASON_LABEL[r]}
          </option>
        ))}
      </Select>
      <Button
        variant="danger"
        disabled={!reason}
        busy={busy}
        onClick={async () => {
          if (!confirm) return setConfirm(true);
          setBusy(true);
          const res = await api(`/api/admin/releases/${id}`, { method: "PATCH", body: { action: "suppress", reason } });
          setBusy(false);
          if (res.ok) router.refresh();
          else setError(res.message);
        }}
      >
        {confirm ? "Confirm removal" : "Remove now"}
      </Button>
      {error ? <p className="text-sm text-error">{error}</p> : null}
    </div>
  );
}
