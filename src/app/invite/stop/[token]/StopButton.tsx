"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { api } from "@/lib/api-client";

export function StopButton({ token }: { token: string }) {
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [message, setMessage] = useState("");
  if (state === "done") {
    return (
      <Notice tone="info" role="status" title="Done">
        MIRA won&apos;t email this address again: no invites, trip links or missed check-in alerts. You can close this page.
      </Notice>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      {state === "error" ? (
        <Notice tone="error" role="alert">
          {message}
        </Notice>
      ) : null}
      <Button
        size="lg"
        variant="danger"
        busy={state === "busy"}
        busyLabel="Stopping…"
        onClick={async () => {
          setState("busy");
          const res = await api<{ status: string }>("/api/invites/stop", { body: { token } });
          if (res.ok) setState("done");
          else {
            setMessage(res.network ? res.message : "This link isn't valid. Open the link from the email again.");
            setState("error");
          }
        }}
      >
        Stop MIRA emails
      </Button>
    </div>
  );
}
