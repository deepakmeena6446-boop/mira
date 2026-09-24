import type { Metadata } from "next";
import { getCapabilities } from "@/server/capabilities";
import { Notice } from "@/components/ui/Notice";
import { ReportFlow } from "./ReportFlow";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Share an observation" };

export default async function ReportPage() {
  const caps = await getCapabilities();
  if (!caps.database) {
    return (
      <Notice tone="attention" title="Reporting is temporarily unavailable">
        MIRA can&apos;t save observations right now. Please try again later.
      </Notice>
    );
  }
  if (!caps.map.available) {
    return (
      <Notice tone="attention" title="Reporting needs the pilot map">
        Reports are tied to a broad area of the pilot map, which isn&apos;t loaded on this server yet.
      </Notice>
    );
  }
  return <ReportFlow aiAvailable={caps.ai} />;
}
